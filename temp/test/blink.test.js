import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { addBlink, detectEyes, blinkTimelines } from '../../server/api/blink.js';
import { generateSkeleton } from '../../server/api/generator.js';
import { buildExportSkeleton } from '../../server/api/targets.js';
import { SpinePreview } from '../../web/renderer.js';

async function character(t, withEyes = true) {
  const dir = await mkdtemp(join(tmpdir(), 'spine-blink-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'head.png');
  await sharp(Buffer.from(`<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
    <rect width="200" height="200" fill="#f9d4c6"/>
    ${withEyes ? '<ellipse cx="62" cy="137" rx="13" ry="18" fill="#4d2f29"/><ellipse cx="138" cy="137" rx="13" ry="18" fill="#4d2f29"/>' : ''}
    <path d="M50 98h24 M126 98h24" stroke="#583b30" stroke-width="3"/>
    <circle cx="100" cy="174" r="3" fill="#e98b8b"/>
    </svg>`)).png().toFile(path);
  const parts = [
    { name: 'body', parent: null, depth: 0, bbox: { x: 130, y: 240, width: 140, height: 120 }, pivot: { x: 70, y: 80 } },
    { name: 'head', parent: 'body', depth: 1, bbox: { x: 100, y: 60, width: 200, height: 200 }, pivot: { x: 100, y: 190 } },
    { name: 'hair', parent: 'head', depth: 2, bbox: { x: 90, y: 30, width: 220, height: 200 }, pivot: { x: 110, y: 190 } }
  ];
  const size = { width: 400, height: 400 };
  const sk = generateSkeleton({ parts }, '3.8', { imageSize: size, connectedSkin: true });
  sk.animations = { idle: { bones: { head: { rotate: [{ time: 0, angle: 0 }, { time: 1, angle: 3 }, { time: 2, angle: 0 }] } } } };
  const cuts = parts.map((part) => ({ ...part, path: part.name === 'head' ? path : '' }));
  return { sk, cuts, size };
}

test('定位双眼时排除眉毛和嘴，返回源图坐标', async (t) => {
  const { cuts } = await character(t);
  const eyes = await detectEyes(cuts);
  assert.equal(eyes.length, 2);
  assert.ok(Math.abs(eyes[0].x + eyes[0].width / 2 - 162) < 1);
  assert.ok(Math.abs(eyes[1].x + eyes[1].width / 2 - 238) < 1);
  assert.ok(eyes.every((eye) => Math.abs(eye.y + eye.height / 2 - 197) < 1));
});

test('眨眼保留骨骼动作，闭眼时双眼压合、鼻子和身体保持原位', async (t) => {
  const { sk, cuts, size } = await character(t);
  const before = structuredClone(sk.animations.idle.bones);
  const eyes = await addBlink(sk, cuts, size);
  assert.deepEqual(sk.animations.idle.bones, before);
  const mesh = sk.skins[0].attachments.head_slot.head;
  const keys = sk.animations.idle.deform.default.head_slot.head;
  const closed = SpinePreview.sampleDeform(keys, 1.2, mesh.blinkOffsets.length);
  const cut = cuts.find((part) => part.name === 'head');
  const indexAt = (x, y) => {
    for (let i = 0; i < mesh.vertices.length / 2; i++) {
      if (Math.abs(mesh.vertices[i * 2] + cut.bbox.x - x) < 1e-6 &&
          Math.abs(cut.bbox.y - mesh.vertices[i * 2 + 1] - y) < 1e-6) return i;
    }
    throw new Error(`缺少眼部细分顶点 ${x},${y}`);
  };
  const position = (index, offsets) => {
    const start = mesh.weights.slice(0, index).reduce((sum, weights) => sum + weights.length * 2, 0);
    const point = [0, 0];
    for (let i = 0; i < mesh.weights[index].length; i++) {
      const bind = mesh.bindPositions[index][i], w = mesh.weights[index][i];
      point[0] += (bind[0] + (offsets[start + i * 2] ?? 0)) * w;
      point[1] += (bind[1] + (offsets[start + i * 2 + 1] ?? 0)) * w;
    }
    return point;
  };
  for (const eye of eyes) {
    const cx = eye.x + eye.width / 2;
    const top = indexAt(cx, eye.y), bottom = indexAt(cx, eye.y + eye.height);
    const height = Math.abs(position(top, closed)[1] - position(bottom, closed)[1]);
    assert.ok(height < eye.height * 0.07 && height > eye.height * 0.05, `闭眼高度 ${height}`);
  }
  const nose = indexAt(200, eyes[0].y + eyes[0].height / 2);
  assert.deepEqual(position(nose, closed), position(nose, []));
  assert.equal(sk.skins[0].attachments.body_slot.body.blinkOffsets, undefined);
  for (const time of [0, 1.34, 2]) {
    assert.ok(SpinePreview.sampleDeform(keys, time, closed.length).every((value) => value === 0));
  }
});

test('重复添加及重新绑定眨眼不会累积关键帧，也不改变原动作', async (t) => {
  const { sk, cuts, size } = await character(t);
  await addBlink(sk, cuts, size);
  const before = structuredClone(sk.animations);
  await addBlink(sk, cuts, size);
  blinkTimelines(sk);
  assert.deepEqual(sk.animations, before);
});

test('眨眼导出为各版本的标准加权网格 deform 轨道', async (t) => {
  const { sk, cuts, size } = await character(t);
  await addBlink(sk, cuts, size);
  for (const target of ['cocos-3.8', 'spine-4.0', 'spine-4.1', 'spine-4.2']) {
    const { json } = buildExportSkeleton(sk, target);
    const modern = ['spine-4.1', 'spine-4.2'].includes(target);
    const track = modern ? json.animations.idle.attachments.default.head_slot.head.deform
      : json.animations.idle.deform.default.head_slot.head;
    const atts = Array.isArray(json.skins) ? json.skins[0].attachments : json.skins.default;
    const mesh = atts.head_slot.head;
    let length = 0;
    for (let i = 0; i < mesh.vertices.length;) {
      const count = mesh.vertices[i++]; length += count * 2; i += count * 4;
    }
    assert.equal(length, sk.skins[0].attachments.head_slot.head.blinkOffsets.length);
    assert.equal(track.length, 6);
    assert.ok(track.some((key) => key.vertices?.some((v) => v !== 0)));
    assert.ok(track.every((key) => (key.offset ?? 0) + (key.vertices?.length ?? 0) <= length));
    assert.equal(mesh.blinkOffsets, undefined);
    assert.equal(json.blink, undefined);
  }
});

test('找不到可靠的双眼时明确失败，保留原骨架', async (t) => {
  const { sk, cuts, size } = await character(t, false);
  const before = structuredClone(sk);
  await assert.rejects(() => addBlink(sk, cuts, size), /无法可靠定位双眼/);
  assert.deepEqual(sk, before);
});

test('稀疏 deform 轨道正确补零、插值、保持阶梯和复位', () => {
  const keys = [{ time: 0 }, { time: 1, offset: 2, vertices: [4, -8] }, { time: 2 }];
  assert.deepEqual([...SpinePreview.sampleDeform(keys, 0.5, 6)], [0, 0, 2, -4, 0, 0]);
  assert.deepEqual([...SpinePreview.sampleDeform(keys, 1.5, 6)], [0, 0, 2, -4, 0, 0]);
  keys[1].curve = 'stepped';
  assert.deepEqual([...SpinePreview.sampleDeform(keys, 1.5, 6)], [0, 0, 4, -8, 0, 0]);
  assert.ok(SpinePreview.sampleDeform(keys, 2, 6).every((v) => v === 0));
});

test('浏览器从后台恢复时循环时间保持在动画长度内', (t) => {
  const originalRaf = globalThis.requestAnimationFrame;
  let frame;
  globalThis.requestAnimationFrame = (callback) => { frame = callback; return 1; };
  t.after(() => { globalThis.requestAnimationFrame = originalRaf; });
  const preview = Object.create(SpinePreview.prototype);
  Object.assign(preview, { playing: true, time: 0.25, speed: 1, duration: 2, loop: true,
    canvas: { clientWidth: 100, clientHeight: 100 }, _lastKnownW: 100, _lastKnownH: 100,
    draw() {} });
  preview.start();
  frame(preview.lastFrame + 120000);
  assert.ok(Math.abs(preview.time - 0.25) < 1e-6);
});
