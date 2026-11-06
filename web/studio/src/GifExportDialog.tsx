import { useEffect, useRef, useState } from 'react';
import { Check, CircleAlert, Film, LoaderCircle, X } from 'lucide-react';
import { exportGif } from './gif-export';
import type { GifProgress } from './gif-export';
import { gifPlan } from './gif-options';
import type { GifOptions } from './gif-options';
import type { ProjectData } from './types';

export function GifExportDialog({ data, animation, onClose }: { data: ProjectData; animation: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const request = useRef<AbortController | null>(null);
  const [options, setOptions] = useState<GifOptions>({ edge: 512, fps: 20, background: 'transparent', loop: data.manifest.loop });
  const [progress, setProgress] = useState<GifProgress | null>(null);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const busy = !!progress;
  const duration = data.manifest.animations.find((item) => item.name === animation)?.duration || 1;
  const plan = gifPlan(data.preview.imageSize, duration, options.edge, options.fps);
  useEffect(() => {
    dialog.current?.showModal();
    return () => { request.current?.abort(); };
  }, []);
  const start = async () => {
    if (request.current) return;
    const abort = new AbortController(); request.current = abort;
    setError(''); setResult(''); setProgress({ phase: '正在准备', current: 0, total: 1 });
    try {
      const gif = await exportGif(data, animation, options, abort.signal, (value) => { if (!abort.signal.aborted) setProgress(value); });
      if (abort.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([gif.bytes], { type: 'image/gif' }));
      const link = document.createElement('a'); link.href = url; link.download = gif.filename;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResult(`已生成并开始下载 · ${(gif.bytes.length / 1024).toFixed(0)} KB`);
    } catch (failure) {
      if (!abort.signal.aborted) setError(failure instanceof Error ? failure.message : 'GIF 导出失败，请重试。');
    } finally {
      if (request.current === abort) { request.current = null; setProgress(null); }
    }
  };
  const cancel = () => { request.current?.abort(); setResult('已取消导出'); };
  return <dialog ref={dialog} className="gif-dialog" aria-labelledby="gif-dialog-title" onClose={onClose}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-heading"><div><span className="scene-eyebrow">ANIMATION EXPORT</span><h2 id="gif-dialog-title"><Film size={18} />导出 GIF</h2></div>
      <button className="icon-button" aria-label="关闭 GIF 导出" onClick={onClose}><X size={16} /></button></div>
    <p className="gif-scene-name">{data.manifest.title || data.manifest.name}<span>/</span>{animation}</p>
    <fieldset disabled={busy} className="gif-settings">
      <label>画面尺寸<select aria-label="GIF 画面尺寸" value={options.edge} onChange={(event) => setOptions({ ...options, edge: Number(event.target.value) })}>
        <option value={512}>长边 512 px</option><option value={256}>长边 256 px</option></select></label>
      <label>帧率<select aria-label="GIF 帧率" value={options.fps} onChange={(event) => setOptions({ ...options, fps: Number(event.target.value) })}>
        {[10, 15, 20, 30].map((fps) => <option value={fps} key={fps}>{fps} fps</option>)}</select></label>
      <label className="gif-background">背景<select aria-label="GIF 背景" value={options.background} onChange={(event) => setOptions({ ...options, background: event.target.value as GifOptions['background'] })}>
        <option value="transparent">透明</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <label className="gif-loop"><input type="checkbox" checked={options.loop} onChange={(event) => setOptions({ ...options, loop: event.target.checked })} />循环播放</label>
    </fieldset>
    <div className="gif-summary"><span>{plan.width} × {plan.height} px</span><span>{plan.duration.toFixed(2)} 秒</span><span>{plan.frames} 帧</span></div>
    <p className="gif-note">导出完整动画，保留素材比例。GIF 使用 256 色和二值透明；柔和边缘可选择浅色或深色背景。</p>
    <div className="gif-feedback" aria-live="polite">
      {progress && <><div><LoaderCircle size={13} className="is-spinning" /><span>{progress.phase}</span><b>{Math.round(progress.current / progress.total * 100)}%</b></div>
        <progress max={progress.total} value={progress.current} /></>}
      {error && <p className="gif-error" role="alert"><CircleAlert size={14} />{error}</p>}
      {result && !busy && <p className="gif-result"><Check size={14} />{result}</p>}
    </div>
    <div className="gif-actions"><button className="secondary-button" onClick={busy ? cancel : onClose}>{busy ? '取消导出' : '关闭'}</button>
      <button className="export-button" disabled={busy} onClick={start}>{busy ? <LoaderCircle size={14} className="is-spinning" /> : <Film size={14} />}{busy ? '正在导出…' : result ? '重新导出' : '导出并下载'}</button></div>
  </dialog>;
}
