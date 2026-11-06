import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { alphaStats, cleanMattePixels, inferTransparentMatte } from '../../server/api/matte-cleanup.js';
import { removeBackground } from '../../server/api/background.js';

function block(foreground = [240, 215, 208]) {
  const w = 32, h = 32, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, inside = x >= 8 && x < 24 && y >= 8 && y < 24;
    data.set(inside ? [...foreground, 255] : [0, 255, 0, 0], i);
  }
  return { data, w, h, at: (x, y) => (y * w + x) * 4 };
}

test('RGBA 不等于透明背景；真实空背景、半透明内容分别识别', () => {
  const opaque = Buffer.from([255, 255, 255, 255, 80, 80, 80, 255]);
  assert.equal(alphaStats(opaque, 2, 1).meaningfulAlpha, false);
  const translucent = Buffer.from([100, 100, 100, 128, 100, 100, 100, 128]);
  assert.equal(alphaStats(translucent, 2, 1).meaningfulAlpha, true);
  assert.equal(alphaStats(translucent, 2, 1).hasClearBackground, false);
  assert.equal(alphaStats(Buffer.from([0, 0, 0, 0, 100, 100, 100, 255]), 2, 1).hasClearBackground, true);
});

test('绿色底色混入软边时恢复前景颜色，已有 alpha 不会再乘一次', () => {
  const { data, w, h, at } = block();
  const edge = at(8, 14); data.set([120, 235, 104, 128], edge);
  assert.deepEqual(inferTransparentMatte(data, w, h), [0, 255, 0]);
  const result = cleanMattePixels(data, w, h, [0, 255, 0], { radius: 3, searchRadius: 8 });
  assert.ok(result.corrected > 0);
  assert.ok(Math.abs(result.buffer[edge] - 240) <= 2);
  assert.ok(Math.abs(result.buffer[edge + 1] - 215) <= 2);
  assert.ok(Math.abs(result.buffer[edge + 2] - 208) <= 2);
  assert.ok(result.buffer[edge + 3] >= 125 && result.buffer[edge + 3] <= 128);
  assert.deepEqual(result.buffer.subarray(at(16, 16), at(16, 16) + 4), data.subarray(at(16, 16), at(16, 16) + 4));
});

test('处理已经变暗的污染 RGB 时保留原 alpha，不把发丝做成黑边', () => {
  const { data, w, h, at } = block();
  const edge = at(8, 14); data.set([37, 111, 0, 81], edge);
  const result = cleanMattePixels(data, w, h, [0, 255, 0], { radius: 3, searchRadius: 8 });
  assert.equal(result.buffer[edge + 3], 81);
  assert.ok(result.buffer[edge] > 200);
  assert.ok(result.buffer[edge + 1] <= result.buffer[edge] + 5);
});

test('真实绿色前景不会被当作绿色溢色全局去掉', () => {
  const { data, w, h, at } = block([20, 160, 30]);
  const result = cleanMattePixels(data, w, h, [0, 255, 0], { radius: 3 });
  for (let y = 8; y < 24; y++) for (let x = 8; x < 24; x++) {
    const i = at(x, y); assert.deepEqual(result.buffer.subarray(i, i + 4), data.subarray(i, i + 4));
  }
});

test('有 alpha 通道但全不透明的 PNG 仍执行背景清理', async () => {
  const { data, w, h, at } = block([180, 20, 30]);
  for (let k = 0; k < w * h; k++) if (!data[k * 4 + 3]) data.set([255, 255, 255, 255], k * 4);
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const result = await removeBackground(png);
  assert.equal(result.skipped, false);
  const decoded = await sharp(result.buffer).ensureAlpha().raw().toBuffer();
  assert.equal(decoded[3], 0);
  assert.deepEqual(decoded.subarray(at(16, 16), at(16, 16) + 4), Buffer.from([180, 20, 30, 255]));
});

test('画出来的棋盘格与全图半透明都不能冒充空透明背景', async () => {
  const png = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#ffffff' } }).png().toBuffer();
  await assert.rejects(() => removeBackground(png, { mode: 'transparent' }), /没有真实透明区域/);
  const soft = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 90, g: 80, b: 70, alpha: 0.5 } } }).png().toBuffer();
  const result = await removeBackground(soft);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'already-transparent');
  await assert.rejects(() => removeBackground(soft, { mode: 'transparent' }), /没有真实透明区域/);
});

test('干净透明输入保持不变，preserve 模式保留原有颜色', async () => {
  const { data, w, h } = block();
  const png = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  const result = await removeBackground(png, { mode: 'preserve' });
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'preserved');
  assert.equal(inferTransparentMatte(Buffer.alloc(100 * 4), 10, 10), null);
});
