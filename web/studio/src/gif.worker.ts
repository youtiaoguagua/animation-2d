import { createGifEncoder } from './gif-encoding';
import type { GifWorkerRequest, GifWorkerResponse } from './gif-options';

const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<GifWorkerRequest>) => void) | null;
  postMessage(value: GifWorkerResponse, transfer: Transferable[]): void;
};
let encoder: ReturnType<typeof createGifEncoder> | null = null;
scope.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') encoder = createGifEncoder(data.width, data.height, data.samples, data.background, data.loop);
    else if (!encoder) throw new Error('GIF 编码器尚未准备好');
    else if (data.type === 'frame') encoder.writeFrame(data.rgba, data.delay);
    else {
      const bytes = encoder.finish(); encoder = null;
      scope.postMessage({ id: data.id, bytes }, [bytes.buffer]); return;
    }
    scope.postMessage({ id: data.id }, []);
  } catch (error) { scope.postMessage({ id: data.id, error: error instanceof Error ? error.message : 'GIF 编码失败' }, []); }
};
