import { SpinePreview } from '../../renderer.js';
import { gifFrameDelay, gifPlan } from './gif-options';
import type { GifOptions, GifWorkerRequest, GifWorkerResponse } from './gif-options';
import type { ProjectData } from './types';

export interface GifProgress { phase: string; current: number; total: number }

export async function exportGif(data: ProjectData, animation: string, options: GifOptions,
  signal: AbortSignal, progress: (value: GifProgress) => void) {
  signal.throwIfAborted();
  const holder = document.createElement('div'), canvas = document.createElement('canvas');
  const size = data.preview.imageSize;
  const initial = gifPlan(size, 1, options.edge, options.fps);
  holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${initial.width}px;height:${initial.height}px;pointer-events:none`;
  holder.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  holder.append(canvas); document.body.append(holder);
  const renderer = new SpinePreview(canvas);
  renderer.dpr = 1;
  let worker: Worker | undefined, sequence = 0;
  let pending: { resolve: (value: GifWorkerResponse) => void; reject: (error: unknown) => void } | undefined;
  const abort = () => { worker?.terminate(); pending?.reject(signal.reason); pending = undefined; };
  signal.addEventListener('abort', abort, { once: true });
  const call = (request: GifWorkerRequest, transfer: Transferable[] = []) => {
    signal.throwIfAborted();
    return new Promise<GifWorkerResponse>((resolve, reject) => {
      pending = { resolve, reject }; worker!.postMessage(request, transfer);
    });
  };
  try {
    progress({ phase: '正在载入素材', current: 0, total: 1 });
    const revision = data.manifest.revision || data.manifest.createdAt;
    const images = new Map(data.preview.imageUrls.map(([name, url]) => [name, `${url}?v=${encodeURIComponent(revision)}`]));
    const loading = renderer.load(data.preview.skeleton, images, size);
    const loaded = await new Promise<number>((resolve, reject) => {
      const cancel = () => reject(signal.reason);
      signal.addEventListener('abort', cancel, { once: true });
      loading.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
      if (signal.aborted) cancel();
    });
    signal.throwIfAborted();
    if (!images.size || loaded !== images.size) throw new Error('素材未完整载入，请等待资源生成完成后重试。');
    if (!data.preview.skeleton.animations[animation]) throw new Error('没有找到所选动画');
    renderer.playAnimation(animation); renderer.pause();
    const plan = gifPlan(size, renderer.duration, options.edge, options.fps);
    canvas.width = plan.width; canvas.height = plan.height;
    renderer.viewWidth = plan.width; renderer.viewHeight = plan.height;
    renderer.fitScale = Math.min(plan.width / size.width, plan.height / size.height) * 0.92;
    renderer.zoom = 1; renderer.panX = 0; renderer.panY = 0;
    renderer.showBones = false; renderer.showWireframe = false; renderer.selectedBone = null;
    renderer.background = 'transparent';
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('浏览器无法创建 GIF 画布');
    const sample = document.createElement('canvas');
    const sampleSize = gifPlan(size, 1, 128, 1);
    sample.width = sampleSize.width; sample.height = sampleSize.height;
    const sampleContext = sample.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) throw new Error('浏览器无法创建调色板');
    const sampleCount = Math.min(8, plan.frames), sampleBytes = sample.width * sample.height * 4;
    const samples = new Uint8Array(sampleBytes * sampleCount);
    // A shared palette avoids colour flicker between consecutive frames.
    for (let i = 0; i < sampleCount; i++) {
      signal.throwIfAborted();
      renderer.seek(i / sampleCount * plan.duration); renderer.draw();
      sampleContext.clearRect(0, 0, sample.width, sample.height);
      sampleContext.drawImage(canvas, 0, 0, sample.width, sample.height);
      samples.set(sampleContext.getImageData(0, 0, sample.width, sample.height).data, i * sampleBytes);
    }
    worker = new Worker(new URL('./gif.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: response }: MessageEvent<GifWorkerResponse>) => {
      const current = pending; pending = undefined;
      if (response.error) current?.reject(new Error(response.error)); else current?.resolve(response);
    };
    worker.onerror = () => { pending?.reject(new Error('GIF 编码器加载失败，请重新载入工作台后重试。')); pending = undefined; };
    progress({ phase: '正在准备调色板', current: 0, total: plan.frames });
    await call({ id: sequence++, type: 'init', width: plan.width, height: plan.height, samples,
      background: options.background, loop: options.loop }, [samples.buffer]);
    for (let i = 0; i < plan.frames; i++) {
      signal.throwIfAborted();
      renderer.seek(i / plan.frames * plan.duration); renderer.draw();
      const rgba = new Uint8Array(context.getImageData(0, 0, plan.width, plan.height).data.buffer);
      await call({ id: sequence++, type: 'frame', rgba, delay: gifFrameDelay(plan.duration, plan.frames, i) }, [rgba.buffer]);
      progress({ phase: '正在导出动画', current: i + 1, total: plan.frames });
    }
    const result = await call({ id: sequence++, type: 'finish' });
    signal.throwIfAborted();
    if (!result.bytes) throw new Error('没有生成 GIF 数据');
    const cleanName = (value: string) => value.replace(/[^\p{L}\p{N}_.-]+/gu, '-').slice(0, 80) || 'animation';
    return { bytes: result.bytes, filename: `${cleanName(data.manifest.name)}-${cleanName(animation)}.gif` };
  } finally {
    signal.removeEventListener('abort', abort); worker?.terminate(); renderer.stop(); holder.remove();
  }
}
