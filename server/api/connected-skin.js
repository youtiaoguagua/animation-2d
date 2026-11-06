/**
 * 将人物所有切片裁自同一张变形网格。
 * 独立网格即使用同一套权重公式，三角形插值也会不同；子件只跟父骨骼走时，
 * 也继承不到父件的蒙皮形变。共用网格后，相同源图坐标始终有相同的变形。
 */
export function connectSkin(skeleton, parts, bounds, density = 8, { blinkEyes = [], meshParts } = {}) {
  const visible = parts.filter((part) => part.bbox && !part.name.startsWith('_'));
  if (!visible.length) return;
  const step = Math.max(8, Math.max(bounds.width, bounds.height) / (Math.max(3, density) * 4));
  const ox = bounds.x + bounds.width / 2;
  const oy = bounds.y + bounds.height / 2;
  const xs = gridAxis(bounds.x, bounds.width, visible.map((p) => [p.bbox.x, p.bbox.x + p.bbox.width]), step,
    blinkEyes.flatMap((eye) => [-0.95, -0.6, -0.5, 0, 0.5, 0.6, 0.95].map((t) => eye.x + eye.width / 2 + eye.width * t)));
  const ys = gridAxis(bounds.y, bounds.height, visible.map((p) => [p.bbox.y, p.bbox.y + p.bbox.height]), step,
    blinkEyes.flatMap((eye) => {
      const cy = eye.y + eye.height / 2, h = eye.height / 2;
      return [-h - 7, -h - 1, -h, 0, h, h + 1, h + 7].map((t) => cy + t);
    }));
  const grid = new Map();
  const point = (i, j) => {
    const key = `${i},${j}`;
    if (!grid.has(key)) {
      const x = xs[i], y = ys[j];
      const owner = ownerAt(visible, x, y);
      grid.set(key, { x, y, bind: new Map([[owner.name, {
        w: 1, x: x - ox, y: oy - y, blink: blinkShift(x, y, blinkEyes)
      }]]) });
    }
    return grid.get(key);
  };
  const attachments = skeleton.skins[0].attachments;
  const targets = meshParts ?? visible;
  for (const part of targets) {
    const bb = part.bbox;
    if (!(bb.width > 0 && bb.height > 0)) continue;
    const pivot = part.pivot ?? { x: bb.width / 2, y: bb.height / 2 };
    const points = [], triangles = [], ids = new Map();
    const add = (p) => {
      const key = `${p.x.toFixed(7)},${p.y.toFixed(7)}`;
      if (!ids.has(key)) { ids.set(key, points.length); points.push(p); }
      return ids.get(key);
    };
    for (let j = 0; j + 1 < ys.length; j++) {
      if (ys[j + 1] <= bb.y || ys[j] >= bb.y + bb.height) continue;
      for (let i = 0; i + 1 < xs.length; i++) {
        if (xs[i + 1] <= bb.x || xs[i] >= bb.x + bb.width) continue;
        const a = point(i, j), b = point(i + 1, j), c = point(i + 1, j + 1), d = point(i, j + 1);
        for (const triangle of [[a, d, b], [b, d, c]]) {
          const polygon = clipRect(triangle, bb);
          for (let k = 1; k + 1 < polygon.length; k++) {
            const [p, q, r] = [polygon[0], polygon[k], polygon[k + 1]];
            if (Math.abs((q.x - p.x) * (r.y - p.y) - (r.x - p.x) * (q.y - p.y)) < 1e-8) continue;
            triangles.push(add(p), add(q), add(r));
          }
        }
      }
    }

    // 外边界排在最前面，保持 Spine hull 的约定。
    const boundary = (p) => Math.min(Math.abs(p.x - bb.x), Math.abs(p.x - bb.x - bb.width),
      Math.abs(p.y - bb.y), Math.abs(p.y - bb.y - bb.height)) < 1e-6;
    const perimeter = (p) => {
      if (Math.abs(p.y - bb.y) < 1e-6) return p.x - bb.x;
      if (Math.abs(p.x - bb.x - bb.width) < 1e-6) return bb.width + p.y - bb.y;
      if (Math.abs(p.y - bb.y - bb.height) < 1e-6) return bb.width + bb.height + bb.x + bb.width - p.x;
      return 2 * (bb.width + bb.height) - (p.y - bb.y);
    };
    const outer = points.map((p, i) => i).filter((i) => boundary(points[i])).sort((a, b) => perimeter(points[a]) - perimeter(points[b]));
    const order = [...outer, ...points.map((p, i) => i).filter((i) => !boundary(points[i]))];
    const remap = new Map(order.map((old, i) => [old, i]));
    const mesh = {
      type: 'mesh', name: part.name, path: `${part.name}.png`, width: bb.width, height: bb.height,
      x: -pivot.x, y: pivot.y, vertices: [], uvs: [], bones: [], weights: [], bindPositions: [],
      triangles: triangles.map((i) => remap.get(i)), hull: outer.length
    };
    const blinkOffsets = [];
    for (const index of order) {
      const p = points[index];
      mesh.vertices.push(p.x - bb.x, bb.y - p.y);
      mesh.uvs.push((p.x - bb.x) / bb.width, (p.y - bb.y) / bb.height);
      const influences = [...p.bind].filter(([, inf]) => inf.w > 1e-10);
      mesh.bones.push(influences.map(([name]) => name));
      mesh.weights.push(influences.map(([, inf]) => inf.w));
      // 裁剪顶点必须插值「权重×静止坐标」，不能只插值权重再套同一个坐标。
      // 这样一个源三角形裁成多块后，在任意姿势下仍然是同一个仿射变换。
      mesh.bindPositions.push(influences.map(([, inf]) => [inf.x / inf.w, inf.y / inf.w]));
      for (const [, inf] of influences) blinkOffsets.push(0, (inf.blink ?? 0) / inf.w);
    }
    if (blinkOffsets.some((value) => Math.abs(value) > 1e-7)) mesh.blinkOffsets = blinkOffsets;
    attachments[`${part.name}_slot`] ??= {};
    attachments[`${part.name}_slot`][part.name] = mesh;
  }
  skeleton.stats = { ...skeleton.stats, connectedSkin: true, skinnedParts: targets.length,
    regionParts: skeleton.slots.length - targets.length };
}

function gridAxis(origin, size, ranges, step, extra) {
  const min = Math.floor((Math.min(origin, ...ranges.map((r) => r[0])) - origin) / step);
  const max = Math.ceil((Math.max(origin + size, ...ranges.map((r) => r[1])) - origin) / step);
  const points = Array.from({ length: max - min + 1 }, (_, i) => origin + (min + i) * step);
  const sorted = [...points, ...extra.filter((p) => p > points[0] && p < points[points.length - 1])].sort((a, b) => a - b);
  return sorted.filter((p, i) => i === 0 || p - sorted[i - 1] > 1e-7);
}

// 在眼睛内沿竖向压合，边缘平滑回到原位置，眉毛、鼻子和嘴保持原位。
function blinkShift(x, y, eyes) {
  let shift = 0;
  const fade = (distance, solid, end) => {
    const t = Math.max(0, Math.min(1, (distance - solid) / (end - solid)));
    return 1 - t * t * (3 - 2 * t);
  };
  for (const eye of eyes) {
    const dx = x - eye.x - eye.width / 2, dy = y - eye.y - eye.height / 2;
    shift += dy * 0.935 * fade(Math.abs(dx), eye.width * 0.6, eye.width * 0.95) *
      fade(Math.abs(dy), eye.height / 2 + 1, eye.height / 2 + 7);
  }
  return shift;
}

function inside(polygon, x, y) {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

function ownerAt(parts, x, y) {
  let owner, bestDepth = -Infinity, nearest, bestDistance = Infinity;
  for (const part of parts) {
    const bb = part.bbox;
    const contains = part.polygon?.length >= 3 ? inside(part.polygon, x, y)
      : x >= bb.x && x <= bb.x + bb.width && y >= bb.y && y <= bb.y + bb.height;
    if (contains && (part.depth ?? 0) > bestDepth) { owner = part; bestDepth = part.depth ?? 0; }
    const dx = Math.max(bb.x - x, 0, x - bb.x - bb.width);
    const dy = Math.max(bb.y - y, 0, y - bb.y - bb.height);
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) { nearest = part; bestDistance = distance; }
  }
  return owner ?? nearest;
}

function mix(a, b, t) {
  const bind = new Map();
  for (const [source, factor] of [[a, 1 - t], [b, t]]) {
    for (const [name, inf] of source.bind) {
      const value = bind.get(name) ?? { w: 0, x: 0, y: 0, blink: 0 };
      value.w += inf.w * factor; value.x += inf.x * factor; value.y += inf.y * factor;
      value.blink += (inf.blink ?? 0) * factor;
      bind.set(name, value);
    }
  }
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, bind };
}

function clipRect(triangle, bb) {
  let polygon = triangle;
  for (const [axis, edge, sign] of [['x', bb.x, 1], ['x', bb.x + bb.width, -1],
    ['y', bb.y, 1], ['y', bb.y + bb.height, -1]]) {
    const out = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const ain = (a[axis] - edge) * sign >= -1e-9, bin = (b[axis] - edge) * sign >= -1e-9;
      if (ain) out.push(a);
      if (ain !== bin) out.push(mix(a, b, (edge - a[axis]) / (b[axis] - a[axis])));
    }
    polygon = out;
    if (!polygon.length) break;
  }
  return polygon;
}
