export type GifBackground = 'transparent' | 'light' | 'dark';
export interface GifOptions { edge: number; fps: number; background: GifBackground; loop: boolean }

export function gifPlan(size: { width: number; height: number }, duration: number, edge: number, fps: number) {
  if (![size.width, size.height, duration, edge, fps].every(Number.isFinite) || size.width <= 0 || size.height <= 0 || duration < 0)
    throw new Error('动画尺寸或时长无效');
  const scale = Math.min(1, Math.max(1, Math.min(512, edge)) / Math.max(size.width, size.height));
  const seconds = Math.max(0.1, duration);
  return { width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)),
    frames: Math.max(1, Math.round(seconds * Math.max(1, Math.min(30, fps)))), duration: seconds };
}

// Cumulative centisecond rounding preserves the full duration at 15/30 fps.
export function gifFrameDelay(duration: number, frames: number, index: number) {
  return (Math.round((index + 1) / frames * duration * 100) - Math.round(index / frames * duration * 100)) * 10;
}

export type GifWorkerRequest = { id: number } & (
  | { type: 'init'; width: number; height: number; samples: Uint8Array; background: GifBackground; loop: boolean }
  | { type: 'frame'; rgba: Uint8Array; delay: number }
  | { type: 'finish' });
export interface GifWorkerResponse { id: number; bytes?: Uint8Array<ArrayBuffer>; error?: string }
