import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { parseArgs, promisify } from 'node:util';
import { resolveRuntime } from './environment.mjs';
import { cleanMattePixels } from './matte-cleanup.mjs';

const execute = promisify(execFile);
export const defaultImageBudget = Object.freeze({ maxEdge: 512, maxBytes: 512 * 1024 });
const exists = (file) => access(file).then(() => true, () => false);
const readJson = (file) => readFile(file, 'utf8').then(JSON.parse).catch(() => null);

function limit(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error(`${name} 必须是 1–${maximum} 的整数`);
  return value;
}

/** One implementation for source CLI and the portable skill launcher. */
export async function prepareImage({ image, directory, prompt = '', backgroundMode = 'auto',
  maxEdge = defaultImageBudget.maxEdge, maxBytes = defaultImageBudget.maxBytes, sharp, inspect }) {
  limit(maxEdge, 'max-edge', 16384); limit(maxBytes, 'max-bytes', 1024 * 1024 * 1024);
  if (!['auto', 'transparent', 'preserve'].includes(backgroundMode)) throw new Error('background 必须是 auto、transparent 或 preserve');
  const input = resolve(image), workdir = resolve(directory);
  const sourceImage = join(workdir, 'source.png'), requestFile = join(workdir, 'request.json');
  const original = await realpath(input);
  for (const target of [sourceImage, requestFile]) {
    if (target === input || await realpath(target).catch(() => null) === original) {
      throw new Error('输入原图与工作副本路径相同，请使用其他 --workdir 以保留原图');
    }
  }
  const originalBytes = await readFile(input);
  const metadata = await sharp(originalBytes).metadata();
  const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
  const sourceWidth = rotated ? metadata.height : metadata.width;
  const sourceHeight = rotated ? metadata.width : metadata.height;
  if (!sourceWidth || !sourceHeight) throw new Error('无法读取图片尺寸');
  const sourceBytes = originalBytes.length;
  const sourceTransparency = metadata.hasAlpha && ['srgb', 'rgb', 'rgb16'].includes(metadata.space)
    ? await inspect(originalBytes) : null;
  const matte = Array.isArray(sourceTransparency?.inferredMatte) ? sourceTransparency.inferredMatte : null;
  let cleanedSource = null;
  if (matte && backgroundMode !== 'preserve') {
    const raw = await sharp(originalBytes).rotate().toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cleanup = cleanMattePixels(raw.data, raw.info.width, raw.info.height, matte);
    cleanedSource = { buffer: cleanup.buffer, width: raw.info.width, height: raw.info.height,
      report: { correctedEdgePixels: cleanup.corrected, spillBefore: cleanup.spillBefore, spillAfter: cleanup.spillAfter } };
  }
  const minimumEdge = Math.min(256, maxEdge, Math.max(sourceWidth, sourceHeight));
  let edge = maxEdge, encoded, limitedByBytes = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const pipeline = (cleanedSource
      ? sharp(cleanedSource.buffer, { raw: { width: cleanedSource.width, height: cleanedSource.height, channels: 4 } })
      : sharp(originalBytes).rotate()).resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb');
    if (matte && !cleanedSource) {
      // Alpha-aware resampling clears invisible RGB. Retain a reliable original
      // matte only under fully transparent pixels so later edge cleanup still works.
      const raw = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      for (let i = 0; i < raw.data.length; i += 4) if (raw.data[i + 3] === 0) {
        raw.data[i] = matte[0]; raw.data[i + 1] = matte[1]; raw.data[i + 2] = matte[2];
      }
      encoded = await sharp(raw.data, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
        .png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });
    } else encoded = await pipeline.png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer({ resolveWithObject: true });
    if (encoded.data.length <= maxBytes) break;
    const current = Math.max(encoded.info.width, encoded.info.height);
    if (current <= minimumEdge) throw new Error(`在最低工作长边 ${minimumEdge}px 时仍超过 ${maxBytes} 字节，请显式调整图片预算`);
    edge = Math.max(minimumEdge, Math.min(current - 1, Math.floor(current * Math.sqrt(maxBytes / encoded.data.length) * 0.95)));
    limitedByBytes = true;
  }
  if (!encoded || encoded.data.length > maxBytes) throw new Error('图片无法满足体积预算，请调整尺寸或字节上限');
  const imageSize = { width: encoded.info.width, height: encoded.info.height };
  const analysisFile = join(workdir, 'analysis.json'), motionFile = join(workdir, 'motion.json');
  if (await exists(analysisFile) || await exists(motionFile)) {
    const old = await sharp(sourceImage).metadata().catch(() => null);
    const plan = await readJson(analysisFile);
    const previous = old?.width && old?.height ? old : plan?.imageSize;
    if (!previous?.width || !previous?.height || previous.width !== imageSize.width || previous.height !== imageSize.height
      || (plan?.imageSize && (plan.imageSize.width !== imageSize.width || plan.imageSize.height !== imageSize.height))) {
      throw new Error('工作目录已有其他尺寸的部件或动作计划，请换新 --workdir 并按缩图后的尺寸重新规划，避免坐标错位');
    }
  }
  const transparency = await inspect(encoded.data);
  if (backgroundMode === 'transparent' && !transparency.hasClearBackground) throw new Error('源图没有真实透明区域，不能将白底或棋盘格当成透明 PNG');
  const imageBudget = { maxEdge, maxBytes, sourceWidth, sourceHeight, sourceBytes,
    width: imageSize.width, height: imageSize.height, bytes: encoded.data.length,
    scaleX: imageSize.width / sourceWidth, scaleY: imageSize.height / sourceHeight,
    resized: imageSize.width !== sourceWidth || imageSize.height !== sourceHeight, limitedByBytes,
    sourceMatte: matte, matteHintPreserved: !!matte && !cleanedSource,
    sourceEdgeCleanup: cleanedSource?.report ?? null };
  const request = { version: 1, imageSize, sourceImage, originalImage: input, prompt, transparency, sourceTransparency,
    imageBudget, analysisFile, motionFile,
    next: 'Inspect the budgeted sourceImage and author analysis.json and motion.json in its returned imageSize. Confirm the user\'s export target (Unity recommended), then build with --target.' };
  await mkdir(workdir, { recursive: true });
  const staging = await mkdtemp(join(workdir, '.image-budget-'));
  try {
    await writeFile(join(staging, 'source.png'), encoded.data);
    await writeFile(join(staging, 'request.json'), JSON.stringify(request, null, 2));
    await rename(join(staging, 'source.png'), sourceImage);
    await rename(join(staging, 'request.json'), requestFile);
  } finally { await rm(staging, { recursive: true, force: true }); }
  return request;
}

export async function runPrepare(argv, skillDirectory) {
  const { values } = parseArgs({ args: argv, options: {
    image: { type: 'string' }, workdir: { type: 'string' }, prompt: { type: 'string' },
    background: { type: 'string', default: 'auto' }, 'max-edge': { type: 'string' }, 'max-bytes': { type: 'string' },
    help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) return { ok: true, result: { command: 'prepare', defaults: defaultImageBudget,
    options: ['--image FILE', '--workdir DIR', '--prompt TEXT', '--background auto|transparent|preserve', '--max-edge PIXELS', '--max-bytes BYTES'] } };
  if (!values.image) throw new Error('缺少 --image');
  const layout = resolveRuntime(skillDirectory);
  const sharp = createRequire(join(layout.packageRoot, 'package.json'))('sharp');
  const staging = await mkdtemp(join(tmpdir(), 'spine-image-inspect-'));
  try {
    const inspect = async (buffer) => {
      const image = join(staging, 'image.png'); await writeFile(image, buffer);
      const { stdout } = await execute(process.execPath, [...layout.entry, 'inspect', '--image', image], { timeout: 30000, maxBuffer: 1024 * 1024 });
      const result = JSON.parse(stdout);
      if (!result.ok) throw new Error(result.error || '图片检查失败');
      return result.result;
    };
    const result = await prepareImage({ image: values.image,
      directory: values.workdir ?? resolve('output', 'plans', basename(values.image)), prompt: values.prompt,
      backgroundMode: values.background, maxEdge: values['max-edge'] === undefined ? undefined : Number(values['max-edge']),
      maxBytes: values['max-bytes'] === undefined ? undefined : Number(values['max-bytes']), sharp, inspect });
    return { ok: true, result };
  } finally { await rm(staging, { recursive: true, force: true }); }
}
