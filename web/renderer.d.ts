import type { Skeleton } from './studio/src/types.js';

export class SpinePreview {
  constructor(canvas: HTMLCanvasElement);
  skeleton: Skeleton | null;
  images: Map<string, HTMLImageElement>;
  animationName: string | null;
  time: number;
  duration: number;
  playing: boolean;
  speed: number;
  zoom: number;
  panX: number;
  panY: number;
  viewWidth: number;
  viewHeight: number;
  loop: boolean;
  showBones: boolean;
  showWireframe: boolean;
  selectedBone: string | null;
  background: string;
  onFrame: ((time: number, duration: number, playing: boolean) => void) | null;
  load(skeleton: Skeleton, images: Map<string, string>, imageSize: { width: number; height: number }): Promise<number>;
  playAnimation(name: string): void;
  play(): void;
  pause(): void;
  togglePlay(): boolean;
  seek(time: number): void;
  step(frames: number): number;
  reset(): void;
  resize(): void;
  start(): void;
  stop(): void;
  draw(): void;
  setSpeed(speed: number): void;
  setZoom(zoom: number): void;
  setPan(x: number, y: number): void;
  setLoop(loop: boolean): void;
}
