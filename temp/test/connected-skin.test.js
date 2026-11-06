import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateSkeleton } from '../../server/api/generator.js';
import { buildExportSkeleton, restWorldBones } from '../../server/api/targets.js';

const SIZE = { width: 400, height: 500 };
const parts = [
  { name: 'body', parent: null, depth: 0, bbox: { x: 120, y: 215, width: 150, height: 180 }, pivot: { x: 75, y: 150 } },
  { name: 'head', parent: 'body', depth: 1, bbox: { x: 90, y: 80, width: 220, height: 170 }, pivot: { x: 110, y: 155 } },
  { name: 'hair', parent: 'head', depth: 2, bbox: { x: 70, y: 40, width: 260, height: 150 }, pivot: { x: 130, y: 130 } },
  { name: 'arm', parent: 'body', depth: 1, bbox: { x: 78, y: 220, width: 65, height: 165 }, pivot: { x: 45, y: 20 } }
];
const build = (connectedSkin = true, density = 8) => generateSkeleton({ parts }, '3.8', { imageSize: SIZE, density, connectedSkin });
const attachment = (sk, name) => sk.skins[0].attachments[`${name}_slot`][name];

// 给骨骼施加不同的仿射变换；头发随头动，身体固定，手臂独立摆动。
function move(name, x, y) {
  const angle = name === 'head' || name === 'hair' ? 0.12 : name === 'arm' ? -0.08 : 0;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c * x - s * y + (name === 'arm' ? 5 : 0), s * x + c * y];
}

function previewVertices(sk, part, att, rest = false) {
  const world = restWorldBones(sk.bones);
  const own = world.get(part.name);
  return Array.from({ length: att.uvs.length / 2 }, (_, v) => {
    const base = [own.x + att.vertices[v * 2] + (att.x ?? 0), own.y + att.vertices[v * 2 + 1] + (att.y ?? 0)];
    const point = [0, 0];
    for (let i = 0; i < att.bones[v].length; i++) {
      const weight = att.weights[v][i];
      if (!weight) continue;
      const bind = att.bindPositions?.[v]?.[i] ?? base;
      const moved = rest ? bind : move(att.bones[v][i], ...bind);
      point[0] += weight * moved[0]; point[1] += weight * moved[1];
    }
    return point;
  });
}

function at(att, vertices, part, x, y) {
  const { bbox: bb } = part;
  const px = (x - bb.x) / bb.width, py = (y - bb.y) / bb.height;
  for (let t = 0; t < att.triangles.length; t += 3) {
    const ids = att.triangles.slice(t, t + 3);
    const [a, b, c] = ids.map((i) => [att.uvs[i * 2], att.uvs[i * 2 + 1]]);
    const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    const u = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / det;
    const v = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / det;
    const w = 1 - u - v;
    if (Math.min(u, v, w) < -1e-7) continue;
    return [0, 1].map((axis) => u * vertices[ids[0]][axis] + v * vertices[ids[1]][axis] + w * vertices[ids[2]][axis]);
  }
  throw new Error(`网格未覆盖 ${part.name} ${x},${y}`);
}

const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const contacts = [
  ['head', 'hair', 104.3, 177.9], ['head', 'hair', 289.2, 169.3],
  ['head', 'body', 180.7, 231.4], ['body', 'arm', 131.8, 338.7]
];

test('同一源图位置在不同切片里，任意姿势下的变形完全一致', () => {
  for (const density of [3, 8, 17]) {
    const sk = build(true, density);
    for (const [first, second, x, y] of contacts) {
      const points = [first, second].map((name) => {
        const part = parts.find((p) => p.name === name), att = attachment(sk, name);
        return at(att, previewVertices(sk, part, att), part, x, y);
      });
      assert.ok(distance(...points) < 1e-7, `${first}/${second} 接缝错位 ${distance(...points)}px`);
    }
  }
});

test('回归夹具能复现旧的独立网格裂缝', () => {
  const sk = build(false);
  const [first, second, x, y] = contacts[0];
  const points = [first, second].map((name) => {
    const part = parts.find((p) => p.name === name), att = attachment(sk, name);
    return at(att, previewVertices(sk, part, att), part, x, y);
  });
  assert.ok(distance(...points) > 1, '旧的头发/头部绑定应在此处错开，保证测试能捕获原问题');
});

test('裁剪网格完整覆盖原切片，静止姿势不改位置，每个顶点至多受三根骨骼影响', () => {
  const sk = build();
  for (const part of parts) {
    const att = attachment(sk, part.name), vertices = previewVertices(sk, part, att, true);
    assert.ok(att.hull > 0);
    for (let v = 0; v < vertices.length; v++) {
      const expected = [part.bbox.x + att.uvs[v * 2] * part.bbox.width - SIZE.width / 2,
        SIZE.height / 2 - part.bbox.y - att.uvs[v * 2 + 1] * part.bbox.height];
      assert.ok(distance(vertices[v], expected) < 1e-7);
      assert.ok(att.bones[v].length <= 3);
      assert.ok(Math.abs(att.weights[v].reduce((a, b) => a + b, 0) - 1) < 1e-8);
    }
    let area = 0;
    for (let t = 0; t < att.triangles.length; t += 3) {
      const [a, b, c] = att.triangles.slice(t, t + 3).map((i) => [att.uvs[i * 2], att.uvs[i * 2 + 1]]);
      area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
    }
    assert.ok(Math.abs(area - 1) < 1e-7, `${part.name} 面积覆盖率 ${area}`);
  }
});

test('Cocos 3.8 和 Spine 4.2 导出的标准加权顶点保留相同的接缝变形', () => {
  const sk = build();
  for (const target of ['cocos-3.8', 'spine-4.2']) {
    const { json } = buildExportSkeleton(sk, target);
    const atts = Array.isArray(json.skins) ? json.skins[0].attachments : json.skins.default;
    const world = restWorldBones(json.bones);
    const deformed = new Map();
    for (const part of parts) {
      const att = atts[`${part.name}_slot`][part.name], vertices = [];
      for (let offset = 0; offset < att.vertices.length;) {
        const count = att.vertices[offset++], point = [0, 0];
        for (let i = 0; i < count; i++) {
          const bone = json.bones[att.vertices[offset++]], x = att.vertices[offset++], y = att.vertices[offset++], w = att.vertices[offset++];
          const rest = world.get(bone.name), p = move(bone.name, rest.x + x, rest.y + y);
          point[0] += p[0] * w; point[1] += p[1] * w;
        }
        vertices.push(point);
      }
      assert.equal(att.bindPositions, undefined, '内部绑定数据必须转换成标准 Spine 顶点');
      deformed.set(part.name, { att, vertices, part });
    }
    for (const [first, second, x, y] of contacts) {
      const points = [first, second].map((name) => {
        const { att, vertices, part } = deformed.get(name);
        return at(att, vertices, part, x, y);
      });
      assert.ok(distance(...points) < 1e-5, `${target} ${first}/${second}: ${distance(...points)}px`);
    }
  }
});

test('UI 素材保持独立部件，不共享人物蒙皮', () => {
  const sk = generateSkeleton({ parts }, '4.2', { imageSize: SIZE, skin: false, connectedSkin: true });
  assert.equal(sk.stats.connectedSkin, undefined);
  assert.ok(Object.values(sk.skins[0].attachments).every((slot) => Object.values(slot)[0].type === 'region'));
});
