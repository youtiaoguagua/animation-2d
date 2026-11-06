import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { buildAnimation, inspectImage, prepare } from '../../agent/engine.js';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function fixture(t: { after: (fn: () => unknown) => void }, width = 1024, height = 768) {
  const dir = await mkdtemp(join(tmpdir(), 'spine-image-budget-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const image = join(dir, 'original.png');
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><ellipse cx="50%" cy="50%" rx="30%" ry="35%" fill="#ad6633"/></svg>`)).png().toFile(image);
  return { dir, image, workdir: join(dir, 'working') };
}

test('默认工作图限制 512px/512KiB，保留原图、比例和透明区域', async (t) => {
  const { image, workdir } = await fixture(t);
  const original = await readFile(image);
  const result = await prepare(image, workdir, 'idle', 'transparent');
  assert.deepEqual(result.imageSize, { width: 512, height: 384 });
  assert.equal(result.imageBudget.scaleX, 0.5);
  assert.equal(result.imageBudget.scaleY, 0.5);
  assert.equal(result.originalImage, image);
  assert.ok(result.transparency.hasClearBackground);
  assert.ok((await readFile(result.sourceImage)).length <= 524288);
  assert.deepEqual(await readFile(image), original);
  const request = JSON.parse(await readFile(join(workdir, 'request.json'), 'utf8'));
  assert.deepEqual(request.imageSize, result.imageSize);
  assert.equal(request.imageBudget.bytes, (await readFile(result.sourceImage)).length);
});

test('小图不放大，显式像素预算可调整', async (t) => {
  const small = await fixture(t, 120, 80);
  assert.deepEqual((await prepare(small.image, small.workdir)).imageSize, { width: 120, height: 80 });
  const large = await fixture(t);
  assert.deepEqual((await prepare(large.image, large.workdir, '', 'auto', { maxEdge: 256 })).imageSize,
    { width: 256, height: 192 });
});

test('先应用 EXIF 方向，再按最终画布规划', async (t) => {
  const { dir, workdir } = await fixture(t);
  const image = join(dir, 'rotated.jpg');
  await sharp({ create: { width: 800, height: 400, channels: 3, background: '#773311' } })
    .withMetadata({ orientation: 6 }).jpeg().toFile(image);
  const result = await prepare(image, workdir);
  assert.deepEqual(result.imageSize, { width: 256, height: 512 });
  assert.equal(result.imageBudget.sourceWidth, 400);
  assert.equal(result.imageBudget.sourceHeight, 800);
});

test('高熵图片按字节预算继续缩小，无法满足时不给出半成品', async (t) => {
  const { dir } = await fixture(t);
  const image = join(dir, 'noise.png');
  await sharp(randomBytes(512 * 512 * 3), { raw: { width: 512, height: 512, channels: 3 } }).png().toFile(image);
  const result = await prepare(image, join(dir, 'bytes'), '', 'auto', { maxBytes: 300 * 1024 });
  assert.ok(result.imageBudget.limitedByBytes);
  assert.ok(result.imageSize.width < 512 && result.imageSize.width >= 256);
  assert.ok(result.imageBudget.bytes <= 300 * 1024);
  const failed = join(dir, 'too-small');
  await assert.rejects(() => prepare(image, failed, '', 'auto', { maxBytes: 1024 }), /仍超过/);
  await assert.rejects(access(join(failed, 'source.png')));
});

test('已有像素计划时拒绝改画布，且不能覆盖输入原图', async (t) => {
  const { image, workdir } = await fixture(t);
  const initial = await prepare(image, workdir, '', 'auto', { maxEdge: 1024 });
  await writeFile(join(workdir, 'analysis.json'), JSON.stringify({ imageSize: initial.imageSize, units: 'pixels', parts: [] }));
  const source = await readFile(initial.sourceImage), request = await readFile(join(workdir, 'request.json'));
  await assert.rejects(() => prepare(image, workdir), /已有其他尺寸/);
  assert.deepEqual(await readFile(initial.sourceImage), source);
  assert.deepEqual(await readFile(join(workdir, 'request.json')), request);
  await assert.rejects(() => prepare(initial.sourceImage, workdir), /保留原图/);
});

test('便携启动器使用同一预算流程，无需重新编译已有 runtime', async (t) => {
  const { dir, image, workdir } = await fixture(t);
  const launcher = join(root, 'skills/spine-animation/scripts/spine.mjs');
  const result = await execute(process.execPath, [launcher, 'prepare', '--image', image, '--workdir', workdir,
    '--max-edge', '256', '--max-bytes', '262144', '--background', 'transparent'], { cwd: dir });
  const data = JSON.parse(result.stdout);
  assert.equal(data.ok, true);
  assert.deepEqual(data.result.imageSize, { width: 256, height: 192 });
  assert.equal(data.result.originalImage, image);
  assert.ok(data.result.imageBudget.bytes <= 262144);
});

test('先按原分辨率修复可靠底色，再缩图，避免绿边随重采样扩散', async (t) => {
  const { dir, workdir } = await fixture(t);
  const image = join(root, 'assets/demo/character-original.png');
  const original = await inspectImage(image);
  assert.ok(Array.isArray(original.inferredMatte));
  const prepared = await prepare(image, workdir, '', 'transparent');
  assert.deepEqual(prepared.imageBudget.sourceMatte, original.inferredMatte);
  assert.ok(prepared.imageBudget.sourceEdgeCleanup.correctedEdgePixels > 0);
  assert.ok(prepared.imageBudget.sourceEdgeCleanup.spillAfter < prepared.imageBudget.sourceEdgeCleanup.spillBefore);
  const { width, height } = prepared.imageSize;
  const analysis = { units: 'pixels', category: 'prop', imageSize: prepared.imageSize, parts: [
    { name: 'body', parent: null, depth: 0, bbox: { x: 0, y: 0, width, height }, pivot: { x: width / 2, y: height / 2 },
      polygon: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: height }, { x: 0, y: height }] }
  ] };
  const result = await buildAnimation({ image: prepared.sourceImage, analysis, output: join(dir, 'output'), project: 'matte-budget',
    segmentation: 'mesh', backgroundMode: 'transparent' });
  assert.ok(result.manifest.transparency!.after.hasClearBackground);
  assert.equal(result.manifest.transparency!.spillAfter, 0);
});
