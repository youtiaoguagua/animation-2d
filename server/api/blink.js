import sharp from 'sharp';
import { connectSkin } from './connected-skin.js';

/** 在脸部切片中找出成对的深色眼睛，返回源图坐标。 */
export async function detectEyes(cutResults) {
  const head = cutResults.find((cut) => /(?:head|face|头|脸)/i.test(cut.name));
  if (!head?.path || !head.bbox) throw new Error('没有找到脸部切片，请先生成包含头部的角色');
  const { data, info } = await sharp(head.path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const mask = new Uint8Array(w * h);
  for (let y = Math.floor(h * 0.35); y < h * 0.9; y++) {
    for (let x = Math.floor(w * 0.15); x < w * 0.85; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] > 200 && Math.max(data[i], data[i + 1], data[i + 2]) < 145 &&
          data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722 < 115) mask[y * w + x] = 1;
    }
  }
  const candidates = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    const queue = [start]; mask[start] = 0;
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let q = 0; q < queue.length; q++) {
      const p = queue[q], x = p % w, y = Math.floor(p / w);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= w || ny < 0 || ny >= h || !mask[ny * w + nx]) continue;
        mask[ny * w + nx] = 0; queue.push(ny * w + nx);
      }
    }
    const width = maxX - minX + 1, height = maxY - minY + 1;
    if (queue.length < Math.max(20, w * h * 0.001) || width < w * 0.03 || width > w * 0.23 ||
        height < h * 0.04 || height > h * 0.25) continue;
    candidates.push({ x: minX, y: minY, width, height, area: queue.length });
  }
  let pair, best = -Infinity;
  for (const a of candidates) for (const b of candidates) {
    const dx = b.x + b.width / 2 - a.x - a.width / 2;
    const dy = Math.abs(b.y + b.height / 2 - a.y - a.height / 2);
    if (dx < w * 0.18 || dx > w * 0.65 || dy > h * 0.08 ||
        Math.min(a.area, b.area) / Math.max(a.area, b.area) < 0.4) continue;
    const score = a.area + b.area - dy * 20;
    if (score > best) { pair = [a, b]; best = score; }
  }
  if (!pair) throw new Error('无法可靠定位双眼，当前功能需要清晰的正面深色眼睛');
  return pair.map(({ x, y, width, height }) => ({
    x: head.bbox.x + x * head.bbox.width / w, y: head.bbox.y + y * head.bbox.height / h,
    width: width * head.bbox.width / w, height: height * head.bbox.height / h
  }));
}

export function blinkTimelines(skeleton) {
  const attachments = skeleton.skins[0].attachments;
  for (const animation of Object.values(skeleton.animations ?? {})) {
    const duration = Math.max(0.5, ...Object.values(animation.bones ?? {}).flatMap((track) =>
      Object.values(track).filter(Array.isArray).flatMap((keys) => keys.map((key) => key.time ?? 0))),
    ...Object.values(animation.slots ?? {}).flatMap((track) => Object.values(track).filter(Array.isArray)
      .flatMap((keys) => keys.map((key) => key.time ?? 0))));
    const close = duration * 0.6;
    for (const [slot, meshes] of Object.entries(attachments)) for (const [name, mesh] of Object.entries(meshes)) {
      if (!mesh.blinkOffsets) continue;
      const values = mesh.blinkOffsets;
      const first = values.findIndex((value) => Math.abs(value) > 1e-7);
      let last = values.length - 1;
      while (last >= first && Math.abs(values[last]) < 1e-7) last--;
      const offset = Math.floor(first / 2) * 2;
      const vertices = values.slice(offset, Math.ceil((last + 1) / 2) * 2).map((v) => +v.toFixed(6));
      const keys = [
        { time: 0 }, { time: +(close - 0.08).toFixed(4) },
        { time: +close.toFixed(4), offset, vertices },
        { time: +(close + 0.04).toFixed(4), offset, vertices },
        { time: +(close + 0.14).toFixed(4) }, { time: duration }
      ];
      animation.deform ??= {}; animation.deform.default ??= {}; animation.deform.default[slot] ??= {};
      animation.deform.default[slot][name] = keys;
    }
  }
}

export function bindBlink(skeleton, parts, imageSize, density, eyes, meshParts) {
  connectSkin(skeleton, parts, { x: 0, y: 0, ...imageSize }, density, { blinkEyes: eyes, meshParts });
  skeleton.blink = { eyes, ...(meshParts ? { regions: parts, meshes: meshParts } : {}) };
  if (!Object.keys(skeleton.animations ?? {}).length) skeleton.animations = { idle: { bones: { root: {
    translate: [{ time: 0, x: 0, y: 0 }, { time: 3, x: 0, y: 0 }]
  } } } };
  blinkTimelines(skeleton);
}

export async function addBlink(skeleton, cutResults, imageSize, density = 8) {
  const eyes = await detectEyes(cutResults);
  const parts = cutResults.map((cut) => ({ name: cut.name, bbox: cut.bbox, pivot: cut.pivot,
    polygon: cut.polygon, depth: skeleton.slots.findIndex((slot) => slot.bone === cut.name) }));
  bindBlink(skeleton, parts, imageSize, density, eyes);
  return eyes;
}
