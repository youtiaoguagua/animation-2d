import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { createGifEncoder } from '../../web/studio/src/gif-encoding.js';
import { gifFrameDelay, gifPlan } from '../../web/studio/src/gif-options.js';

function frame(x: number, color = [235, 84, 45, 255]) {
  const rgba = new Uint8Array(32 * 32 * 4);
  for (let y = 8; y < 24; y++) for (let column = x; column < x + 8; column++) rgba.set(color, (y * 32 + column) * 4);
  return rgba;
}

test('透明 GIF 保留实心黑色，下一帧清除上一帧，正确编码循环和延迟', async () => {
  const first = frame(3, [0, 0, 0, 255]), second = frame(21);
  const samples = new Uint8Array([...first, ...second]);
  const gif = createGifEncoder(32, 32, samples, 'transparent', true);
  gif.writeFrame(first, 50); gif.writeFrame(second, 50);
  const bytes = gif.finish();
  const metadata = await sharp(bytes, { animated: true }).metadata();
  assert.equal(metadata.format, 'gif'); assert.equal(metadata.pages, 2);
  assert.equal(metadata.loop, 0); assert.deepEqual(metadata.delay, [50, 50]);
  const { data, info } = await sharp(bytes, { animated: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.height, 64); assert.equal(info.channels, 4);
  const pixel = (page: number, x: number, y: number) => [...data.subarray(((page * 32 + y) * 32 + x) * 4, ((page * 32 + y) * 32 + x) * 4 + 4)];
  assert.deepEqual(pixel(0, 4, 12), [0, 0, 0, 255]);
  assert.equal(pixel(1, 4, 12)[3], 0, '旧位置应透明，不能留下上一帧残影');
  assert.equal(pixel(1, 22, 12)[3], 255);
  assert.equal(pixel(0, 22, 12)[3], 0);
});

test('浅色 GIF 将半透明像素合成到背景，支持只播放一次', async () => {
  const rgba = frame(3, [0, 0, 0, 128]);
  const gif = createGifEncoder(32, 32, rgba, 'light', false);
  gif.writeFrame(rgba, 100);
  const bytes = gif.finish();
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.loop, 1);
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([...data.subarray(0, 4)], [255, 255, 255, 255]);
  const pixel = [...data.subarray((12 * 32 + 4) * 4, (12 * 32 + 4) * 4 + 4)];
  assert.equal(pixel[3], 255); assert.ok(Math.abs(pixel[0] - 127) <= 8);
});

test('GIF 保持比例与像素预算，不放大小图，15/30 fps 累积时长正确', () => {
  assert.deepEqual(gifPlan({ width: 800, height: 1600 }, 2, 512, 20), { width: 256, height: 512, frames: 40, duration: 2 });
  assert.equal(gifPlan({ width: 32, height: 48 }, 2, 512, 20).height, 48);
  for (const fps of [15, 30]) {
    const plan = gifPlan({ width: 512, height: 512 }, 1.93, 512, fps);
    const delays = Array.from({ length: plan.frames }, (_, i) => gifFrameDelay(plan.duration, plan.frames, i));
    assert.equal(delays.reduce((sum, value) => sum + value, 0), 1930);
    assert.ok(delays.every((delay) => delay >= 20));
  }
  assert.throws(() => gifPlan({ width: 0, height: 10 }, 2, 512, 20), /无效/);
});
