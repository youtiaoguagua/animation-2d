import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { SpinePreview } from '../../renderer.js';
import type { ProjectData, ViewSettings } from './types';

export interface Playback { time: number; duration: number; playing: boolean }
export interface LoadState { phase: 'idle' | 'loading' | 'ready' | 'partial' | 'error'; loaded: number; total: number; message: string }

export function usePreview(canvas: RefObject<HTMLCanvasElement | null>, data: ProjectData | null,
  settings: ViewSettings, animation: string) {
  const instance = useRef<SpinePreview | null>(null);
  const latest = useRef({ settings, animation });
  latest.current = { settings, animation };
  const [frame, setFrame] = useState<Playback>({ time: 0, duration: 0, playing: false });
  const [load, setLoad] = useState<LoadState>({ phase: 'idle', loaded: 0, total: 0, message: '' });

  useEffect(() => {
    if (!data || !canvas.current) {
      setLoad({ phase: 'idle', loaded: 0, total: 0, message: '' });
      setFrame({ time: 0, duration: 0, playing: false });
      return;
    }
    let cancelled = false;
    const renderer = new SpinePreview(canvas.current);
    instance.current = renderer;
    let lastUpdate = 0;
    renderer.onFrame = (time, duration, playing) => {
      if (cancelled) return;
      const now = performance.now();
      if (now - lastUpdate > 45 || !playing) {
        lastUpdate = now;
        setFrame((previous) => previous.time === time && previous.playing === playing && previous.duration === duration
          ? previous : { time, duration, playing });
      }
    };
    const observer = new ResizeObserver(() => renderer.resize());
    if (canvas.current.parentElement) observer.observe(canvas.current.parentElement);
    const images = new Map(data.preview.imageUrls.map(([name, url]) =>
      [name, `${url}?v=${encodeURIComponent(data.manifest.createdAt)}`]));
    setLoad({ phase: 'loading', loaded: 0, total: images.size, message: '正在载入纹理与骨骼…' });
    setFrame({ time: 0, duration: 0, playing: false });
    renderer.load(data.preview.skeleton, images, data.preview.imageSize).then((loaded) => {
      if (cancelled) { instance.current?.resize(); return; }
      const view = latest.current.settings;
      renderer.background = view.background;
      renderer.showBones = view.bones;
      renderer.showWireframe = view.wireframe;
      renderer.selectedBone = view.selectedBone;
      renderer.setZoom(view.zoom);
      renderer.setSpeed(view.speed);
      renderer.setLoop(view.loop);
      if (latest.current.animation) renderer.playAnimation(latest.current.animation);
      if (!loaded) {
        setLoad({ phase: 'error', loaded, total: images.size, message: '贴图未能载入，请检查作品文件后刷新。' });
        return;
      }
      setFrame({ time: renderer.time, duration: renderer.duration || 0, playing: renderer.playing });
      renderer.start();
      setLoad({ phase: loaded === images.size ? 'ready' : 'partial', loaded, total: images.size,
        message: loaded === images.size ? '预览已就绪' : `${images.size - loaded} 张贴图未能载入` });
    }).catch((error: unknown) => {
      if (!cancelled) setLoad({ phase: 'error', loaded: 0, total: images.size,
        message: error instanceof Error ? error.message : '预览加载失败' });
    });
    return () => {
      cancelled = true;
      renderer.onFrame = null;
      renderer.stop();
      observer.disconnect();
      if (instance.current === renderer) {
        instance.current = null;
        const element = canvas.current;
        element?.getContext('2d')?.clearRect(0, 0, element.width, element.height);
      }
    };
  }, [data, canvas]);

  useEffect(() => {
    const renderer = instance.current;
    if (!renderer) return;
    renderer.background = settings.background;
    renderer.showBones = settings.bones;
    renderer.showWireframe = settings.wireframe;
    renderer.selectedBone = settings.selectedBone;
    renderer.setZoom(settings.zoom);
    renderer.setSpeed(settings.speed);
    renderer.setLoop(settings.loop);
  }, [settings]);

  useEffect(() => {
    const renderer = instance.current;
    if (renderer?.skeleton?.animations[animation]) {
      renderer.playAnimation(animation);
      renderer.play();
    }
  }, [animation]);

  const sync = () => {
    const renderer = instance.current;
    if (!renderer) return;
    renderer.draw();
    setFrame({ time: renderer.time, duration: renderer.duration, playing: renderer.playing });
  };
  const controls = {
    toggle() { instance.current?.togglePlay(); sync(); },
    seek(time: number) { instance.current?.seek(time); sync(); },
    step(frames: number) { instance.current?.step(frames); sync(); },
    restart() { instance.current?.seek(0); instance.current?.play(); sync(); },
    fit() { instance.current?.setPan(0, 0); instance.current?.resize(); },
    pan(x: number, y: number) { instance.current?.setPan(x, y); },
    zoomAt(value: number, clientX?: number, clientY?: number) {
      const renderer = instance.current;
      if (!renderer) return;
      if (clientX !== undefined && clientY !== undefined) {
        const rect = canvas.current!.getBoundingClientRect();
        const x = clientX - rect.left - renderer.viewWidth / 2;
        const y = clientY - rect.top - renderer.viewHeight / 2;
        const ratio = value / renderer.zoom;
        renderer.setPan(x - (x - renderer.panX) * ratio, y - (y - renderer.panY) * ratio);
      }
      renderer.setZoom(value);
    }
  };
  return { instance, frame, load, controls };
}
