import * as gifenc from 'gifenc';
import type { GifBackground } from './gif-options.js';

// gifenc publishes an ESM browser entry and a CommonJS Node entry.
const { GIFEncoder, applyPalette, quantize } = typeof gifenc.GIFEncoder === 'function' ? gifenc : gifenc.default;

function composite(rgba: Uint8Array | Uint8ClampedArray, background: GifBackground) {
  if (background === 'transparent') return rgba;
  const result = new Uint8Array(rgba.length);
  const color = background === 'light' ? [255, 255, 255] : [21, 25, 31];
  for (let i = 0; i < rgba.length; i += 4) {
    const alpha = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) result[i + c] = Math.round(rgba[i + c] * alpha + color[c] * (1 - alpha));
    result[i + 3] = 255;
  }
  return result;
}

export function createGifEncoder(width: number, height: number, samples: Uint8Array, background: GifBackground, loop: boolean) {
  const transparent = background === 'transparent';
  let colors = composite(samples, background);
  if (transparent) {
    const opaque = new Uint8Array(samples.length);
    let length = 0;
    for (let i = 0; i < samples.length; i += 4) {
      if (samples[i + 3] < 128) continue;
      opaque.set(samples.subarray(i, i + 4), length); length += 4;
    }
    colors = opaque.slice(0, length);
  }
  const opaquePalette = quantize(colors.length ? colors : new Uint8Array([0, 0, 0, 255]), transparent ? 255 : 256);
  // Reserve a separate index so solid black never becomes transparent.
  const palette = transparent ? [[0, 0, 0], ...opaquePalette] : opaquePalette;
  const encoder = GIFEncoder();
  let count = 0;
  return {
    writeFrame(rgba: Uint8Array, delay: number) {
      if (rgba.length !== width * height * 4) throw new Error('GIF 帧尺寸不一致');
      const indices = applyPalette(composite(rgba, background), opaquePalette);
      if (transparent) for (let i = 0; i < indices.length; i++) indices[i] = rgba[i * 4 + 3] < 128 ? 0 : indices[i] + 1;
      encoder.writeFrame(indices, width, height, { palette: count++ === 0 ? palette : undefined, delay,
        repeat: loop ? 0 : -1, transparent, transparentIndex: 0, dispose: 2 });
    },
    finish() { encoder.finish(); return new Uint8Array(encoder.bytes()); }
  };
}
