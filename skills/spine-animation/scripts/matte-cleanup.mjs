/** Shared alpha inspection and conservative edge unmatting for preparation and export. */
export function alphaStats(data, width, height) {
  let transparent = 0, soft = 0, opaque = 0, border = 0, clearBorder = 0;
  for (let k = 0; k < width * height; k++) {
    const a = data[k * 4 + 3];
    if (a <= 8) transparent++; else if (a < 255) soft++; else opaque++;
    const x = k % width, y = Math.floor(k / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) { border++; if (a <= 8) clearBorder++; }
  }
  return { transparent, soft, opaque, transparentFraction: transparent / (width * height),
    borderTransparentFraction: clearBorder / Math.max(1, border),
    meaningfulAlpha: transparent + soft >= Math.max(1, Math.ceil(width * height * 0.0001)),
    hasClearBackground: transparent >= Math.max(1, Math.ceil(width * height * 0.0001)) };
}

export function parseMatteColor(value) {
  if (Array.isArray(value) && value.length === 3 && value.every((v) => Number.isFinite(v) && v >= 0 && v <= 255)) return value.map(Math.round);
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
  throw new Error('matte color 必须为 #RRGGBB');
}

/** Infer only a strongly colored, consistently stored transparent matte. */
export function inferTransparentMatte(data, width, height) {
  const groups = new Map();
  const stride = Math.max(1, Math.floor(width * height / 50000));
  let samples = 0;
  for (let k = 0; k < width * height; k += stride) {
    const i = k * 4;
    if (data[i + 3] > 8) continue;
    const key = `${data[i] >> 5},${data[i + 1] >> 5},${data[i + 2] >> 5}`;
    const group = groups.get(key) ?? { count: 0, rgb: [0, 0, 0] };
    group.count++; group.rgb[0] += data[i]; group.rgb[1] += data[i + 1]; group.rgb[2] += data[i + 2];
    groups.set(key, group); samples++;
  }
  const best = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < samples * 0.6) return null;
  const color = best.rgb.map((v) => Math.round(v / best.count));
  return Math.max(...color) - Math.min(...color) >= 70 ? color : null;
}

function edgeDistances(data, width, height, limit) {
  const distance = new Uint8Array(width * height).fill(255), queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  for (let k = 0; k < distance.length; k++) if (data[k * 4 + 3] <= 8) { distance[k] = 0; queue[tail++] = k; }
  while (head < tail) {
    const k = queue[head++], next = distance[k] + 1;
    if (next > limit) continue;
    const x = k % width, y = Math.floor(k / width);
    for (const n of [x > 0 ? k - 1 : -1, x + 1 < width ? k + 1 : -1, y > 0 ? k - width : -1, y + 1 < height ? k + width : -1]) {
      if (n < 0 || distance[n] <= next) continue;
      distance[n] = next; queue[tail++] = n;
    }
  }
  return distance;
}

const excess = (data, i, channel) => data[i + channel] - Math.max(data[i + (channel + 1) % 3], data[i + (channel + 2) % 3]);

export function cleanMattePixels(data, width, height, background, options = {}) {
  const out = Buffer.from(data);
  if (!background) return { buffer: out, corrected: 0, clearedRgb: 0, spillBefore: 0, spillAfter: 0 };
  const radius = options.radius ?? Math.max(2, Math.min(8, Math.round(Math.max(width, height) / 128)));
  const search = options.searchRadius ?? radius + 4;
  const distance = edgeDistances(data, width, height, radius + search);
  const dominant = background.indexOf(Math.max(...background));
  const chromatic = Math.max(...background) - Math.min(...background) >= 70;
  let corrected = 0, clearedRgb = 0, spillBefore = 0, protectedColor = 0, unresolved = 0;
  const samples = [];
  for (let k = 0; k < width * height; k++) {
    const i = k * 4, alpha = data[i + 3];
    if (alpha <= 8) {
      if (out[i] || out[i + 1] || out[i + 2]) clearedRgb++;
      out[i] = out[i + 1] = out[i + 2] = 0;
      continue;
    }
    if (distance[k] > radius || (chromatic && excess(data, i, dominant) <= 12)) continue;
    if (chromatic && excess(data, i, dominant) > 25) spillBefore++;
    const x = k % width, y = Math.floor(k / width);
    let best = null, bestScore = Infinity, fallback = null, fallbackScore = Infinity;
    let nearestDeep = null, deepDistance = Infinity;
    for (let yy = Math.max(0, y - search); yy <= Math.min(height - 1, y + search); yy++) {
      for (let xx = Math.max(0, x - search); xx <= Math.min(width - 1, x + search); xx++) {
        const q = yy * width + xx, qi = q * 4, spatial = (x - xx) ** 2 + (y - yy) ** 2;
        if (data[qi + 3] < 250 || distance[q] < Math.min(3, distance[k] + 1)) continue;
        if (distance[q] > radius && spatial < deepDistance) { nearestDeep = qi; deepDistance = spatial; }
        if (chromatic && excess(data, qi, dominant) > 10) continue;
        let denominator = 0, numerator = 0, ff = 0, bb = 0, fb = 0, cf = 0, cb = 0;
        for (let c = 0; c < 3; c++) {
          const f = data[qi + c] - background[c];
          denominator += f * f; numerator += (data[i + c] - background[c]) * f;
          ff += data[qi + c] ** 2; bb += background[c] ** 2; fb += data[qi + c] * background[c];
          cf += data[i + c] * data[qi + c]; cb += data[i + c] * background[c];
        }
        if (denominator < 40 ** 2) continue;
        // Some RGBA exports store dimmed/matted RGB despite having their own alpha.
        // Fit C=sF+tB without assuming s+t=1; retain that existing alpha for this case.
        const determinant = ff * bb - fb * fb;
        if (chromatic && determinant > 1) {
          const s = (cf * bb - cb * fb) / determinant, t = (cb * ff - cf * fb) / determinant;
          if (s > 0.01 && t > 0.01 && s + t <= 1.5) {
            let error = 0;
            for (let c = 0; c < 3; c++) error += (s * data[qi + c] + t * background[c] - data[i + c]) ** 2;
            const score = error + spatial * 0.3;
            if (error < 30 ** 2 && score < fallbackScore) { fallback = { qi }; fallbackScore = score; }
          }
        }
        const a = Math.max(0, Math.min(1, numerator / denominator));
        if (a > 0.985) continue;
        let error = 0;
        for (let c = 0; c < 3; c++) error += (background[c] + a * (data[qi + c] - background[c]) - data[i + c]) ** 2;
        const score = error + spatial * 0.3;
        if (error < (options.maxError ?? 60) ** 2 && score < bestScore) { best = { a, qi }; bestScore = score; }
      }
    }
    // Keep intentionally colored clothing/foliage when the inner foreground has that color too.
    if (chromatic && nearestDeep !== null && excess(data, nearestDeep, dominant) > 18) { protectedColor++; continue; }
    if (!best && fallback) {
      out[i] = data[fallback.qi]; out[i + 1] = data[fallback.qi + 1]; out[i + 2] = data[fallback.qi + 2];
      corrected++; continue;
    }
    if (!best) {
      unresolved++;
      if (options.debug && samples.length < 12) samples.push({ x, y, rgba: [...data.subarray(i, i + 4)], distance: distance[k], nearestDeep: nearestDeep === null ? null : [...data.subarray(nearestDeep, nearestDeep + 4)] });
      continue;
    }
    const a = best.a;
    if (a < 0.025) {
      out[i] = out[i + 1] = out[i + 2] = out[i + 3] = 0;
    } else {
      for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255,
        Math.round((data[i + c] - (1 - a) * background[c]) / a)));
      if (chromatic) out[i + dominant] = Math.min(out[i + dominant],
        Math.max(out[i + (dominant + 1) % 3], out[i + (dominant + 2) % 3]) + Math.max(0, excess(data, best.qi, dominant)));
      out[i + 3] = Math.min(alpha, Math.round(a * 255));
    }
    corrected++;
  }
  let spillAfter = 0;
  if (chromatic) for (let k = 0; k < width * height; k++) {
    if (distance[k] <= radius && out[k * 4 + 3] > 8 && excess(out, k * 4, dominant) > 25) spillAfter++;
  }
  return { buffer: out, corrected, clearedRgb, spillBefore, spillAfter, protectedColor, unresolved, ...(options.debug ? { samples } : {}) };
}
