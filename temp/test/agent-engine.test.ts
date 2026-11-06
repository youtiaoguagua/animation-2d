import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { buildAnimation, normalizePlan, validateMotion } from '../../agent/engine.js';
import { listenPreview } from '../../agent/preview.js';
import type { AnalysisPlan, MotionPlan } from '../../agent/types.js';
import { chooseSegmentation } from '../../agent/segmentation.js';

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture(t: { after: (fn: () => unknown) => void }) {
  const { rm } = await import('node:fs/promises');
  const dir = await mkdtemp(join(tmpdir(), 'spine-agent-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const image = join(dir, 'source image.png');
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400">
    <rect x="92" y="202" width="116" height="170" rx="30" fill="#6388a7"/>
    <ellipse cx="150" cy="135" rx="90" ry="95" fill="#f8d4c0"/>
    <ellipse cx="115" cy="163" rx="12" ry="17" fill="#4a2b24"/>
    <ellipse cx="185" cy="163" rx="12" ry="17" fill="#4a2b24"/>
  </svg>`)).png().toFile(image);
  const plan: AnalysisPlan = { units: 'pixels', category: 'character', imageSize: { width: 300, height: 400 }, parts: [
    { name: 'body', parent: null, depth: 0, bbox: { x: 90, y: 200, width: 120, height: 175 }, pivot: { x: 60, y: 120 },
      polygon: [{ x: 90, y: 200 }, { x: 210, y: 200 }, { x: 210, y: 375 }, { x: 90, y: 375 }] },
    { name: 'head', parent: 'body', depth: 1, bbox: { x: 60, y: 40, width: 180, height: 190 }, pivot: { x: 90, y: 175 },
      polygon: [{ x: 150, y: 40 }, { x: 215, y: 68 }, { x: 240, y: 135 }, { x: 215, y: 202 }, { x: 150, y: 230 }, { x: 85, y: 202 }, { x: 60, y: 135 }, { x: 85, y: 68 }] }
  ] };
  const motion: MotionPlan = { name: 'idle', duration: 2, loop: true, tracks: [{ part: 'head', rotate: [
    { t: 0, deg: 0, ease: 'inOut' }, { t: 0.5, deg: 3, ease: 'inOut' }, { t: 1, deg: 0, ease: 'inOut' },
    { t: 1.5, deg: -3, ease: 'inOut' }, { t: 2, deg: 0 }
  ] }] };
  return { dir, image, plan, motion, output: join(dir, 'animation output') };
}

test('normalized 和 pixel 坐标对应同一几何，pivot 始终相对 bbox', async (t) => {
  const { plan } = await fixture(t);
  const normalized = structuredClone(plan); normalized.units = 'normalized';
  for (const part of normalized.parts) {
    part.pivot.x /= part.bbox.width; part.pivot.y /= part.bbox.height;
    part.bbox.x /= 300; part.bbox.width /= 300; part.bbox.y /= 400; part.bbox.height /= 400;
    part.polygon = part.polygon!.map((p) => ({ x: p.x / 300, y: p.y / 400 }));
  }
  const a = normalizePlan(plan, { width: 300, height: 400 });
  const b = normalizePlan(normalized, { width: 300, height: 400 });
  assert.deepEqual(b.parts.map((part) => [part.name, part.parent, part.depth]), a.parts.map((part) => [part.name, part.parent, part.depth]));
  const coordinates = (parts: AnalysisPlan['parts']) => parts.flatMap((part) => [
    ...Object.values(part.bbox), ...Object.values(part.pivot), ...part.polygon!.flatMap((point) => [point.x, point.y])
  ]);
  const expected = coordinates(a.parts);
  coordinates(b.parts).forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-9));
});

test('错误方案在创建输出前被拒绝：环、越界、未知动作部件、空通道', async (t) => {
  const { image, plan, motion, output } = await fixture(t);
  const cyclic = structuredClone(plan); cyclic.parts[0].parent = 'head';
  await assert.rejects(() => buildAnimation({ image, analysis: cyclic, output, project: 'bad' }), /有环/);
  const outside = structuredClone(plan); outside.parts[0].bbox.width = 1000;
  assert.throws(() => normalizePlan(outside, { width: 300, height: 400 }), /超出/);
  const badMotion = structuredClone(motion); badMotion.tracks![0].part = 'missing';
  assert.throws(() => validateMotion(badMotion, new Set(['head'])), /不存在/);
  assert.throws(() => validateMotion({ duration: 1, tracks: [{ part: 'head' }] }, new Set(['head'])), /缺少动作通道/);
  await assert.rejects(access(output));
});

test('完整本地构建不调用模型 API，并产出可加载的骨架、图集、贴图和眨眼', async (t) => {
  const { image, plan, motion, output } = await fixture(t);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('构建期间不应发起网络请求'); };
  t.after(() => { globalThis.fetch = original; });
  const result = await buildAnimation({ image, analysis: plan, motion, output, project: 'native', name: 'hero', blink: true, segmentation: 'polygon' });
  assert.equal(calls, 0);
  assert.equal(result.manifest.id, 'native/hero');
  assert.equal(result.manifest.target.id, 'unity');
  assert.equal(result.manifest.blink, true);
  assert.equal(result.editableProject, null);
  for (const path of result.files) await access(path);
  const json = JSON.parse(await readFile(result.files[0], 'utf8'));
  assert.equal(json.skeleton.spine, '4.2.10');
  assert.ok(Array.isArray(json.skins));
  assert.ok(json.animations.idle.attachments.default.head_slot.head.deform.some((key: { vertices?: number[] }) => key.vertices?.some((n) => n !== 0)));
  const png = result.files.find((file: string) => file.endsWith('.png'))!;
  assert.ok((await sharp(png).metadata()).width! > 0);
  assert.equal(JSON.parse(await readFile(result.manifestFile, 'utf8')).version, 1);
  await assert.rejects(() => buildAnimation({ image, analysis: plan, motion, output, project: 'native', name: 'hero', segmentation: 'polygon' }), /--replace/);
});

test('从另一个工作目录调用 skill launcher，仍能使用相对输入和 JSON 输出', async (t) => {
  const { dir, plan, motion } = await fixture(t);
  await writeFile(join(dir, 'analysis.json'), JSON.stringify(plan));
  await writeFile(join(dir, 'motion.json'), JSON.stringify(motion));
  const launcher = join(root, 'skills/spine-animation/scripts/spine.mjs');
  const help = JSON.parse((await run(process.execPath, [launcher, '--help'], { cwd: dir })).stdout);
  assert.equal(help.ok, true);
  assert.ok(help.result.commands.build);
  const result = await run(process.execPath, [launcher, 'build',
    '--image', 'source image.png', '--analysis', 'analysis.json', '--motion', 'motion.json',
    '--output', 'cli output', '--project', 'cli-native', '--blink', '--segmentation', 'polygon'], { cwd: dir,
    env: { ...process.env, ANTHROPIC_API_KEY: '', ANTHROPIC_AUTH_TOKEN: '', OPENAI_API_KEY: '' } });
  const json = JSON.parse(result.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.result.manifest.blink, true);
  assert.equal(await realpath(json.result.output), await realpath(join(dir, 'cli output')));
});

test('源码 CLI 默认导出 Unity，同时保留显式 Cocos 的兼容格式', async (t) => {
  const { dir, plan, motion } = await fixture(t);
  await writeFile(join(dir, 'analysis.json'), JSON.stringify(plan));
  await writeFile(join(dir, 'motion.json'), JSON.stringify(motion));
  const entry = [join(root, 'node_modules/tsx/dist/cli.mjs'), join(root, 'agent/cli.ts')];
  const help = JSON.parse((await run(process.execPath, [...entry, '--help'], { cwd: dir })).stdout);
  assert.equal(help.result.defaultTarget, 'unity');
  assert.equal(help.result.exportTargets[0].id, 'unity');
  for (const target of [
    { id: 'unity', version: '4.2.10', flags: [] },
    { id: 'cocos-3.8', version: '3.8.75', flags: ['--target', 'cocos-3.8'] }
  ]) {
    const response = await run(process.execPath, [...entry, 'build', '--image', 'source image.png',
      '--analysis', 'analysis.json', '--motion', 'motion.json', '--output', 'source cli output',
      '--project', target.id, '--blink', '--segmentation', 'polygon', ...target.flags], { cwd: dir });
    const { ok, result } = JSON.parse(response.stdout);
    assert.equal(ok, true);
    assert.equal(result.manifest.target.id, target.id);
    assert.equal(result.manifest.blink, true);
    const skeleton = JSON.parse(await readFile(result.files[0], 'utf8'));
    assert.equal(skeleton.skeleton.spine, target.version);
    assert.equal(Array.isArray(skeleton.skins), target.id === 'unity');
    const frames = target.id === 'unity' ? skeleton.animations.idle.attachments.default.head_slot.head.deform
      : skeleton.animations.idle.deform.default.head_slot.head;
    assert.ok(frames.some((key: { vertices?: number[] }) => key.vertices?.some((n) => n !== 0)));
  }
});

test('作品目录可搬迁；预览服务提供列表、播放数据、图片和下载文件', async (t) => {
  const { dir, image, plan, motion, output } = await fixture(t);
  const result = await buildAnimation({ image, analysis: plan, motion, output, project: 'portable', name: 'hero', segmentation: 'polygon' });
  const moved = join(dir, 'moved output'); await cp(output, moved, { recursive: true });
  const server = await listenPreview(moved, 0);
  t.after(() => { server.closeAllConnections(); return new Promise<void>((done) => server.close(() => done())); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const list = await fetch(`${base}/api/projects`).then((res) => res.json()) as { projects: { id: string }[] };
  assert.equal(list.projects[0].id, result.manifest.id);
  const response = await fetch(`${base}/api/project?id=${encodeURIComponent(result.manifest.id)}`).then((res) => res.json()) as { preview: { skeleton: unknown; imageUrls: string[][] }; manifest: { files: { url: string }[] } };
  assert.ok(response.preview.skeleton);
  for (const [, url] of response.preview.imageUrls) assert.equal((await fetch(base + url)).status, 200);
  for (const file of response.manifest.files) assert.equal((await fetch(base + file.url)).status, 200);
  assert.equal((await fetch(`${base}/api/project?id=unknown`)).status, 404);
  assert.match(await fetch(base).then((res) => res.text()), /Spine Studio/);
  assert.match(await fetch(base + '/renderer.js').then((res) => res.text()), /class SpinePreview/);
});

test('可选 SAM 的路由明确，显式要求缺失模型时不悄悄冒充 SAM', () => {
  const none = { mobilesam: { available: false }, sam3: { available: false } };
  assert.equal(chooseSegmentation('auto', none), 'polygon');
  assert.equal(chooseSegmentation('mesh', none), 'mesh');
  assert.throws(() => chooseSegmentation('sam3', none), /sam-setup/);
  assert.equal(chooseSegmentation('auto', { mobilesam: { available: true }, sam3: { available: true } }), 'mobilesam');
  assert.equal(chooseSegmentation('sam3', { mobilesam: { available: true }, sam3: { available: true } }), 'sam3');
});

test('透明整图模式保留完整纹理，用多个骨骼驱动一个网格并支持眨眼', async (t) => {
  const { image, plan, motion, output } = await fixture(t);
  const result = await buildAnimation({ image, analysis: plan, motion, output, project: 'whole', name: 'hero',
    segmentation: 'mesh', backgroundMode: 'transparent', blink: true });
  assert.equal(result.manifest.slots, 1);
  assert.equal(result.manifest.partCount, 2);
  assert.equal(result.manifest.bones, 3);
  assert.equal(result.manifest.segmentation?.backend, 'mesh');
  assert.equal(result.manifest.transparency?.after.hasClearBackground, true);
  const state = JSON.parse(await readFile(result.previewFile, 'utf8'));
  assert.equal(state.imageUrls.length, 1);
  const attachment = Object.values(state.skeleton.skins[0].attachments)[0] as Record<string, { bones: string[][] }>;
  assert.ok(Object.values(attachment)[0].bones.some((names) => names.includes('head')));
  const exported = JSON.parse(await readFile(result.files[0], 'utf8'));
  assert.ok(exported.animations.idle.attachments.default);
  const bad = structuredClone(motion); bad.tracks![0].alpha = [{ t: 0, a: 0 }, { t: 2, a: 1 }];
  await assert.rejects(() => buildAnimation({ image, analysis: plan, motion: bad, output, project: 'unsupported', segmentation: 'mesh' }), /淡入淡出/);
});
