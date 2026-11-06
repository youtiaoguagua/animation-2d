import sharp from 'sharp';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { cutImageParts, applyCutGeometry, diagnoseAlignment, bleedAlpha } from '../server/api/cutter.js';
import { buildBasePlate, basePlatePart } from '../server/api/baseplate.js';
import { removeBackground } from '../server/api/background.js';
import { generateSkeleton, generateAnimations, exportToSpine } from '../server/api/generator.js';
import { bakeMotion, applyMotion, summarizeParts } from '../server/api/motion-core.js';
import { addBlink, detectEyes, bindBlink } from '../server/api/blink.js';
import { connectSkin } from '../server/api/connected-skin.js';
import { alphaStats, inferTransparentMatte } from '../server/api/matte-cleanup.js';
import { prepareProjectDir, sourceDirOf, tempDirOf, safeName } from '../server/api/workspace.js';
import { EXPORT_TARGETS, DEFAULT_TARGET, resolveTarget } from '../server/api/targets.js';
import type { AnalysisPlan, Box, Category, Manifest, MotionPlan, Part, Point } from './types.js';
import { segmentationBackend, segment, type SegmentationMode } from './segmentation.js';

const categories = new Set(['character', 'prop', 'effect', 'item', 'ui']);
const safePart = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
function fail(message: string): never { throw new Error(message); }

/** Validate every coordinate and parent before creating or replacing artifacts. */
export function normalizePlan(input: unknown, size: { width: number; height: number }): { plan: AnalysisPlan; parts: Part[]; warnings: string[] } {
  if (!isRecord(input) || !['normalized', 'pixels'].includes(String(input.units))) fail('analysis.units 必须是 normalized 或 pixels');
  if (!categories.has(String(input.category))) fail('analysis.category 必须是 character/prop/effect/item/ui');
  if (!Array.isArray(input.parts) || input.parts.length < 1 || input.parts.length > 60) fail('parts 数量必须在 1–60 之间');
  if (input.imageSize && (!isRecord(input.imageSize) || input.imageSize.width !== size.width || input.imageSize.height !== size.height)) fail('方案的 imageSize 与实际输入图片不一致');
  const plan = structuredClone(input) as unknown as AnalysisPlan;
  const warnings: string[] = [];
  const names = new Set<string>();
  for (const part of plan.parts) {
    if (!isRecord(part) || !safePart.test(part.name) || names.has(part.name)) fail('部件名称必须唯一，并使用英文字母、数字、_ 或 -（以字母开头）');
    names.add(part.name);
    if (part.parent !== null && typeof part.parent !== 'string') fail(`${part.name}: parent 必须是部件名或 null`);
    if (!Number.isInteger(part.depth) || part.depth < 0) fail(`${part.name}: depth 必须是非负整数`);
    const bb = part.bbox;
    if (!isRecord(bb) || ![bb.x, bb.y, bb.width, bb.height].every(finite) || bb.width <= 0 || bb.height <= 0) fail(`${part.name}: bbox 无效`);
    const w = plan.units === 'normalized' ? 1 : size.width;
    const h = plan.units === 'normalized' ? 1 : size.height;
    if (bb.x < 0 || bb.y < 0 || bb.x + bb.width > w + 1e-6 || bb.y + bb.height > h + 1e-6) fail(`${part.name}: bbox 超出图片边界`);
    if (!isRecord(part.pivot) || ![part.pivot.x, part.pivot.y].every(finite)) fail(`${part.name}: pivot 无效`);
    const pw = plan.units === 'normalized' ? 1 : bb.width, ph = plan.units === 'normalized' ? 1 : bb.height;
    if (part.pivot.x < 0 || part.pivot.y < 0 || part.pivot.x > pw || part.pivot.y > ph) fail(`${part.name}: pivot 必须相对于本部件 bbox`);
    if (part.polygon) {
      if (!Array.isArray(part.polygon) || part.polygon.length < 3 || part.polygon.length > 256) fail(`${part.name}: polygon 至少需要 3 个顶点`);
      if (part.polygon.some((point) => !isRecord(point) || !finite(point.x) || !finite(point.y) || point.x < 0 || point.y < 0 || point.x > w || point.y > h)) fail(`${part.name}: polygon 必须使用整张源图的坐标`);
      const area = part.polygon.reduce((sum, point, i, polygon) => {
        const next = polygon[(i + 1) % polygon.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0);
      if (Math.abs(area) < 1e-10) fail(`${part.name}: polygon 面积为零`);
    } else warnings.push(`${part.name} 未提供 polygon，使用矩形区域，请检查预览`);
  }
  const byName = new Map(plan.parts.map((part) => [part.name, part]));
  const done = new Set<string>(), active = new Set<string>();
  const visit = (part: Part) => {
    if (active.has(part.name)) fail(`父子关系有环: ${part.name}`);
    if (done.has(part.name)) return;
    active.add(part.name);
    if (part.parent) {
      const parent = byName.get(part.parent);
      if (!parent) fail(`${part.name}: 父部件 ${part.parent} 不存在`);
      visit(parent);
    }
    active.delete(part.name); done.add(part.name);
  };
  plan.parts.forEach(visit);
  const parts = plan.parts.map((part): Part => {
    const bb: Box = plan.units === 'normalized' ? { x: part.bbox.x * size.width, y: part.bbox.y * size.height,
      width: part.bbox.width * size.width, height: part.bbox.height * size.height } : { ...part.bbox };
    const pivot: Point = plan.units === 'normalized' ? { x: part.pivot.x * bb.width, y: part.pivot.y * bb.height } : { ...part.pivot };
    const polygon = part.polygon?.map((point) => plan.units === 'normalized' ? { x: point.x * size.width, y: point.y * size.height } : { ...point });
    return { ...part, bbox: bb, pivot, polygon, occlusion_edges: part.occlusion_edges ?? [] };
  });
  return { plan, parts, warnings };
}

export function validateMotion(input: unknown, names: Set<string>): MotionPlan {
  if (!isRecord(input)) fail('动作方案必须是 JSON 对象');
  if (input.none === true) return { none: true };
  if (!finite(input.duration) || input.duration <= 0 || input.duration > 30) fail('动作 duration 必须在 0–30 秒之间');
  if (!Array.isArray(input.tracks) || input.tracks.length === 0) fail('动作方案必须包含 tracks');
  if (input.name !== undefined && !safePart.test(String(input.name))) fail('动作名应使用英文字母、数字、_ 或 -');
  const seen = new Set<string>();
  for (const track of input.tracks) {
    if (!isRecord(track) || !names.has(String(track.part)) || seen.has(String(track.part))) fail(`动作部件不存在或重复: ${String(track?.part)}`);
    seen.add(String(track.part));
    if (!['translate', 'rotate', 'scale', 'alpha'].some((channel) => track[channel] !== undefined)) fail(`${String(track.part)} 缺少动作通道`);
    for (const channel of ['translate', 'rotate', 'scale', 'alpha']) {
      const keys = track[channel];
      if (keys === undefined) continue;
      if (!Array.isArray(keys) || !keys.length) fail(`${String(track.part)}.${channel} 必须是非空关键帧数组`);
      let previous = -1;
      for (const key of keys) {
        if (!isRecord(key) || !finite(key.t) || key.t < previous || key.t < 0 || key.t > input.duration) fail(`${String(track.part)}.${channel}: 时间无效或未排序`);
        previous = key.t;
        const fields = channel === 'rotate' ? ['deg'] : channel === 'alpha' ? ['a'] : ['x', 'y'];
        if (fields.some((field) => !finite(key[field]))) fail(`${String(track.part)}.${channel}: 缺少 ${fields.join('/')}`);
        if (key.ease !== undefined && !['linear', 'in', 'out', 'inOut', 'back', 'step'].includes(String(key.ease))) fail('未知的 ease');
      }
    }
  }
  return structuredClone(input) as MotionPlan;
}

export async function inspectImage(image: string | Buffer) {
  const { data, info } = await sharp(image).rotate().ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, ...alphaStats(data, info.width, info.height),
    inferredMatte: inferTransparentMatte(data, info.width, info.height) };
}

export async function prepare(image: string, directory: string, prompt = '', backgroundMode = 'auto') {
  if (!['auto', 'transparent', 'preserve'].includes(backgroundMode)) fail('background 必须是 auto、transparent 或 preserve');
  const input = resolve(image), workdir = resolve(directory);
  const png = await sharp(input).rotate().png().toBuffer();
  const meta = await sharp(png).metadata();
  const transparency = await inspectImage(png);
  if (backgroundMode === 'transparent' && !transparency.hasClearBackground) fail('源图没有真实透明区域，不能将白底或棋盘格当成透明 PNG');
  await mkdir(workdir, { recursive: true });
  const source = join(workdir, 'source.png');
  await writeFile(source, png);
  const request = { version: 1, imageSize: { width: meta.width!, height: meta.height! },
    sourceImage: source, originalImage: input, prompt, transparency, analysisFile: join(workdir, 'analysis.json'), motionFile: join(workdir, 'motion.json'),
    next: 'Inspect sourceImage and author analysis.json and motion.json using references/plans.md. Confirm the user\'s export target (Unity is the default recommendation), then run build with --target.' };
  await writeFile(join(workdir, 'request.json'), JSON.stringify(request, null, 2));
  return request;
}

export function assetUrl(root: string, file: string): string {
  const path = relative(root, file);
  if (path.startsWith(`..${sep}`) || path === '..') fail('产物路径不在输出目录内');
  return `/output/${path.split(sep).map(encodeURIComponent).join('/')}`;
}

export function animationDuration(value: unknown): number {
  if (Array.isArray(value)) return Math.max(0, ...value.map((key) => isRecord(key) && finite(key.time) ? key.time : 0));
  if (isRecord(value)) return Math.max(0, ...Object.values(value).map(animationDuration));
  return 0;
}

export interface BuildOptions {
  image: string;
  analysis: unknown;
  motion?: unknown;
  output: string;
  project: string;
  name?: string;
  target?: string;
  density?: number;
  blink?: boolean;
  background?: boolean;
  backgroundMode?: 'auto' | 'transparent' | 'preserve';
  matteColor?: string;
  segmentation?: SegmentationMode;
  title?: string;
  replace?: boolean;
  editable?: boolean;
  spineCliPath?: string;
  onLog?: (message: string) => void;
}

/** Local-only build: the calling agent supplies the visual and motion plans. */
export async function buildAnimation(options: BuildOptions) {
  const sourceBuffer = await sharp(resolve(options.image)).rotate().png().toBuffer();
  const meta = await sharp(sourceBuffer).metadata();
  const imageSize = { width: meta.width!, height: meta.height! };
  const { plan, parts, warnings } = normalizePlan(options.analysis, imageSize);
  const motion = options.motion === undefined ? undefined : validateMotion(options.motion, new Set(parts.map((part) => part.name)));
  const targetId = options.target ?? DEFAULT_TARGET;
  if (!Object.hasOwn(EXPORT_TARGETS, targetId)) fail(`未知导出目标: ${targetId}`);
  const target = resolveTarget(targetId);
  const density = options.density ?? 8;
  if (!Number.isInteger(density) || density < 3 || density > 24) fail('density 必须是 3–24 的整数');
  const requestedSegmentation = options.segmentation ?? 'auto';
  const backend = await segmentationBackend(requestedSegmentation);
  if (backend === 'mesh' && motion?.tracks?.some((track) => track.alpha?.length)) fail('整图蒙皮不支持单个部件淡入淡出，请使用 polygon、mobilesam 或 sam3');
  const backgroundMode = options.backgroundMode ?? (options.background === false ? 'preserve' : 'auto');
  const removed = await removeBackground(sourceBuffer, { mode: backgroundMode, matteColor: options.matteColor });
  const processed = removed.buffer ?? sourceBuffer;
  if ((removed.transparency?.after.opaque ?? 0) + (removed.transparency?.after.soft ?? 0) === 0) fail('图片没有可见主体');
  if (backend === 'mesh' && plan.category === 'character' && backgroundMode !== 'preserve' && !removed.transparency?.after.hasClearBackground) {
    fail('整图蒙皮需要真实透明背景，请先生成透明 PNG 或完成背景提取');
  }
  const output = resolve(options.output), project = safeName(options.project);
  const name = safeName(options.name ?? basename(options.image).replace(/\.[^.]+$/, ''));
  const manifestFile = join(tempDirOf(output, project, name), 'manifest.json');
  const alreadyBuilt = await access(manifestFile).then(() => true, () => false);
  if (alreadyBuilt && !options.replace) fail(`此项目已有结果。迭代同一素材时使用 --replace，或选择新的 --project: ${project}/${name}`);
  const log = options.onLog ?? (() => {});
  const workspace = await prepareProjectDir(output, project, { sourceName: name, clean: false });
  const sourceImage = join(workspace.sourceDir, 'source.png');
  const inputImage = join(workspace.sourceDir, 'input.png');
  await writeFile(inputImage, sourceBuffer);
  await writeFile(sourceImage, processed);
  const segmented = await segment(sourceImage, parts, requestedSegmentation, backend, log);
  if (segmented.report.note && (segmented.report.samParts.length || segmented.report.note.includes('失败'))) warnings.push(segmented.report.note);
  if (backgroundMode !== 'preserve' && !removed.transparency?.after.meaningfulAlpha) warnings.push('输入仍不透明，背景可能混入部件；请使用真实透明素材或先完成背景提取');
  if ((removed.transparency?.spillAfter ?? 0) > 100) warnings.push('边缘仍有疑似残色，请在深浅背景下对照检查');
  log(backend === 'mesh' ? '整图蒙皮：保留完整透明纹理，不拆图' : `切分 ${parts.length} 个部件（${segmented.report.backend}）`);
  let cuts: any[] = [];
  let plate: any = null;
  if (backend !== 'mesh') {
    cuts = await cutImageParts(sourceImage, parts, workspace.imagesDir,
      { margin: 8, bleed: 2, snap: true, halo: plan.category !== 'character', samMasks: segmented.masks });
    plate = await buildBasePlate(sourceImage, cuts, workspace.imagesDir, { bleed: 2, onLog: log });
    if (plate) { cuts.unshift(plate); warnings.push('有未被轮廓覆盖的像素归入底板，请检查预览'); }
    segmented.report.samParts = cuts.filter((cut) => cut.contour === 'sam').map((cut) => cut.name);
    segmented.report.polygonParts = cuts.filter((cut) => cut.contour !== 'sam' && !cut.name.startsWith('_')).map((cut) => cut.name);
  }
  const geometry = { parts: backend === 'mesh' ? parts : applyCutGeometry(plate ? [basePlatePart(imageSize.width, imageSize.height), ...parts] : parts, cuts) };
  const skeleton = generateSkeleton(geometry, target.atlasVersion, { imageSize, density,
    skin: plan.category === 'character', connectedSkin: backend !== 'mesh' });
  generateAnimations(skeleton);
  let meshParts: Part[] | undefined;
  if (backend === 'mesh') {
    const rootBone = skeleton.bones.find((bone: { parent?: string }) => !bone.parent);
    const whole: Part = { name: rootBone.name, parent: null, depth: 0, bbox: { x: 0, y: 0, ...imageSize }, pivot: { x: imageSize.width / 2, y: imageSize.height / 2 } };
    skeleton.slots = [{ name: `${whole.name}_slot`, bone: whole.name, attachment: whole.name }];
    skeleton.skins[0].attachments = {};
    meshParts = [whole];
    connectSkin(skeleton, parts, { x: 0, y: 0, ...imageSize }, density, { meshParts });
    skeleton.stats.wholeImage = true;
    const path = join(workspace.imagesDir, `${whole.name}.png`);
    const raw = await sharp(processed).ensureAlpha().raw().toBuffer();
    const padded = bleedAlpha(raw, imageSize.width, imageSize.height, 2);
    await sharp(padded, { raw: { ...imageSize, channels: 4 } }).png().toFile(path);
    cuts = [{ ...whole, path, size: imageSize, contour: 'image' }];
  }
  if (motion && !motion.none) {
    const baked = bakeMotion(motion, skeleton, { imageSize, category: plan.category, name: motion.name });
    applyMotion(skeleton, baked);
    warnings.push(...baked.warnings);
  }
  if (options.blink) {
    if (plan.category !== 'character') fail('--blink 只适用于角色类素材');
    if (meshParts) {
      const head = parts.find((part) => /head|face|头|脸/i.test(part.name));
      if (!head) fail('眨眼需要 head 或 face 部件来定位双眼');
      const left = Math.floor(head.bbox.x), top = Math.floor(head.bbox.y);
      const box = { x: left, y: top, width: Math.min(imageSize.width - left, Math.ceil(head.bbox.x + head.bbox.width) - left),
        height: Math.min(imageSize.height - top, Math.ceil(head.bbox.y + head.bbox.height) - top) };
      const reference = join(workspace.sourceDir, 'eye-reference.png');
      await sharp(processed).extract({ left, top, width: box.width, height: box.height }).png().toFile(reference);
      const eyes = await detectEyes([{ name: 'head', bbox: box, path: reference }]);
      bindBlink(skeleton, parts, imageSize, density, eyes, meshParts);
    } else await addBlink(skeleton, cuts, imageSize, density);
  }
  const alignment = backend === 'mesh' ? [] : await diagnoseAlignment(cuts.filter((cut: { name: string }) => !cut.name.startsWith('_')));
  const exportRoot = sourceDirOf(output, project, name);
  log(`导出 ${target.label}`);
  const exported = await exportToSpine(skeleton, exportRoot, name, {
    target: targetId, cutResults: cuts, spineImagesPath: `../../${name}_temp/Image/`,
    skipSpineProject: !options.editable && !options.spineCliPath, spineCliPath: options.spineCliPath
  });
  const files = [
    { path: exported.skeletonPath, kind: 'json' }, { path: exported.atlas?.atlasPath, kind: 'atlas' },
    { path: join(dirname(exported.skeletonPath), `${name}.png`), kind: 'texture' },
    { path: sourceImage, kind: 'source' }
  ];
  for (const file of files) {
    if (!file.path) fail(`缺少导出文件: ${file.kind}`);
    await access(file.path);
  }
  if ((options.editable || options.spineCliPath) && !exported.spineProject?.path) warnings.push(exported.spineProject?.reason ?? '未生成可编辑 .spine 源工程');
  const state = { skeleton, imageSize, category: plan.category, analysis: geometry, alignment,
    imageUrls: cuts.map((cut: { name: string; path: string }) => [cut.name, assetUrl(output, cut.path)]),
    motionParts: summarizeParts(geometry.parts), sourceUrl: assetUrl(output, sourceImage) };
  const previewFile = join(workspace.sourceDir, 'preview.json');
  const manifest: Manifest = {
    version: 1, id: `${project}/${name}`, project, name, title: options.title ?? name, category: plan.category,
    createdAt: new Date().toISOString(), target: { id: target.id, label: target.label, spine: target.spineHeader }, imageSize,
    sourceUrl: assetUrl(output, sourceImage), inputUrl: assetUrl(output, inputImage), previewFile: relative(output, previewFile).split(sep).join('/'),
    bones: skeleton.bones.length, slots: skeleton.slots.length, partCount: parts.length,
    transparency: removed.transparency, segmentation: segmented.report,
    animations: Object.entries(skeleton.animations as Record<string, unknown>).map(([name, animation]) => ({ name, duration: animationDuration(animation) })),
    blink: !!skeleton.blink, loop: motion?.loop !== false, warnings: [...new Set(warnings)],
    files: files.map((file) => ({ name: basename(file.path), url: assetUrl(output, file.path), kind: file.kind }))
  };
  await writeFile(join(workspace.sourceDir, 'analysis.plan.json'), JSON.stringify(plan, null, 2));
  if (motion) await writeFile(join(workspace.sourceDir, 'motion.plan.json'), JSON.stringify(motion, null, 2));
  await writeFile(previewFile, JSON.stringify(state));
  // Publishing the manifest last makes incomplete jobs invisible to the gallery.
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  return { manifest, manifestFile, previewFile, output, exportDirectory: dirname(exported.skeletonPath),
    files: files.map((file) => file.path), editableProject: exported.spineProject?.path ?? null };
}

export async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}
