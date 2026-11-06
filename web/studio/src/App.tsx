import { useEffect, useMemo, useRef, useState } from 'react';
import type { ButtonHTMLAttributes, PointerEvent } from 'react';
import { Activity, ArrowDownToLine, ArrowUpRight, Bone, Box, Check, CheckCheck, ChevronDown,
  ChevronRight, ChevronsLeft, ChevronsRight, CircleAlert, CircleHelp, Columns2, Download, FileCode2,
  FileImage, FileJson, Files, FolderOpen, GitBranch, Grid2X2, Hand, Image as ImageIcon, Layers3,
  Maximize2, Moon, PanelLeftClose, PanelRightClose, Pause, Play, RefreshCw, Repeat2, Search,
  Settings2, SkipBack, SkipForward, SlidersHorizontal, Sun, Triangle, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { animationTracks, friendlyBone, shortTarget, timecode } from './types';
import type { Background, ExportFile, Manifest, ProjectData, TimelineTrack, ViewSettings } from './types';
import { usePreview } from './use-preview';
import type { Playback } from './use-preview';

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean };
function IconButton({ icon: Icon, label, active, className = '', children, ...props }: IconButtonProps) {
  return <button type="button" className={`icon-button ${active ? 'is-active' : ''} ${className}`}
    title={label} aria-label={label} aria-pressed={active} {...props}><Icon size={16} strokeWidth={1.65} />{children}</button>;
}

async function getJson<T,>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `读取作品失败 (${response.status})`);
  return payload as T;
}

const cached = (url: string, revision: string) => `${url}?v=${encodeURIComponent(revision)}`;
const clampZoom = (value: number) => Math.min(4, Math.max(0.25, Math.round(value * 100) / 100));
const number = (value?: number) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fileIcon = (kind: string) => kind === 'json' ? FileJson : ['texture', 'source', 'gif'].includes(kind) ? FileImage : FileCode2;

function Property({ name, value, suffix }: { name: string; value: string | number; suffix?: string }) {
  return <div className="property"><span>{name}</span><div><output>{value}</output>{suffix && <small>{suffix}</small>}</div></div>;
}

function FileList({ files }: { files: ExportFile[] }) {
  return <div className="file-list">{files.map((file) => {
    const Icon = fileIcon(file.kind);
    return <a key={file.url} href={file.url} download={file.name} className="file-item" title={`下载 ${file.name}`}>
      <span className={`file-icon file-${file.kind}`}><Icon size={17} /></span>
      <span className="file-text"><strong>{file.name}</strong><small>{file.kind === 'json' ? '骨骼与动画' : file.kind === 'atlas' ? '图集映射' : file.kind === 'texture' ? '图集纹理' : file.kind === 'source' ? '透明源图' : '附件'}</small></span>
      <ArrowDownToLine size={14} />
    </a>;
  })}</div>;
}

function Timeline({ data, name, frame, tracks, selectedBone, onSelect, onSeek, onAnimation, disabled }:
  { data: ProjectData | null; name: string; frame: Playback; tracks: TimelineTrack[]; selectedBone: string | null;
    onSelect: (name: string) => void; onSeek: (time: number) => void; onAnimation: (name: string) => void; disabled: boolean }) {
  const [scale, setScale] = useState(1);
  const trackLabels = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const duration = frame.duration || data?.manifest.animations.find((item) => item.name === name)?.duration || 2;
  const tickStep = duration <= 4 ? 0.25 : duration <= 12 ? 1 : 2;
  const ticks = Array.from({ length: Math.floor(duration / tickStep) + 1 }, (_, index) => index * tickStep);
  const seekAt = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(duration, (event.clientX - rect.left) / rect.width * duration)));
  };
  return <section className="timeline-panel" aria-label="动画时间轴">
    <div className="timeline-heading">
      <div className="timeline-title"><Activity size={15} /><strong>动画时间轴</strong><span className="muted-tag">预览</span></div>
      <div className="timeline-actions"><span className="timeline-frame">第 <b>{Math.round(frame.time * 30)}</b> 帧</span>
        <span className="thin-divider" /><label className="compact-select">30 fps</label>
        <label className="compact-select"><ZoomIn size={13} /><select aria-label="时间轴缩放" value={scale} onChange={(event) => setScale(Number(event.target.value))}>
          <option value={1}>100%</option><option value={1.5}>150%</option><option value={2}>200%</option>
        </select></label>
      </div>
    </div>
    <div className="timeline-body">
      <div className="track-labels">
        <div className="track-selector"><Layers3 size={13} /><select aria-label="选择动画" id="animationSelect" value={name} onChange={(event) => onAnimation(event.target.value)} disabled={disabled}>
          {Object.keys(data?.preview.skeleton.animations || {}).map((animation) => <option key={animation}>{animation}</option>)}
          {!data && <option value="">选择动画</option>}
        </select><ChevronDown size={12} /></div>
        <div className="track-label-scroll" ref={trackLabels} onWheel={(event) => { if (scrollArea.current) scrollArea.current.scrollTop += event.deltaY; }}>{tracks.map((track) => <button key={track.id} className={`track-label ${selectedBone === track.bone ? 'selected' : ''}`}
          aria-label={`检查${friendlyBone(track.bone)}${track.label}轨道`} onClick={() => onSelect(track.bone)} title={`${track.bone} · ${track.label}`}>
          {track.channel === 'deform' ? <Grid2X2 size={12} /> : <Bone size={12} />}<span>{friendlyBone(track.bone)}</span><small>{track.label}</small>
        </button>)}{!tracks.length && <p className="track-empty">加载作品后查看关键帧</p>}</div>
      </div>
      <div className="timeline-scroll" ref={scrollArea} onScroll={(event) => { if (trackLabels.current) trackLabels.current.scrollTop = event.currentTarget.scrollTop; }}>
        <div className="timeline-content" style={{ width: `${scale * 100}%` }}>
          <div className="time-ruler">
            {ticks.map((tick) => <span key={tick} className={`ruler-tick ${Math.round(tick / tickStep) % 2 === 0 ? 'major' : ''}`}
              style={{ left: `${tick / duration * 100}%` }}>{Math.round(tick / tickStep) % 2 === 0 ? `${number(tick)}s` : ''}</span>)}
            <input id="timeline" type="range" aria-label="播放进度" min="0" max="1000" step={1000 / Math.max(1, Math.round(duration * 30))} value={frame.time / duration * 1000}
              disabled={disabled} onChange={(event) => onSeek(Number(event.target.value) / 1000 * duration)} />
          </div>
          <div className="timeline-tracks" onPointerDown={seekAt}>
            {tracks.map((track) => <div key={track.id} className={`timeline-track ${selectedBone === track.bone ? 'selected' : ''}`}
              style={{ backgroundSize: `${tickStep / duration * 100}% 100%` }}>
              <div className={`track-span ${track.channel === 'deform' ? 'deform' : ''}`} style={{ left: `${(track.times[0] || 0) / duration * 100}%`,
                width: `${((track.times.at(-1) || duration) - (track.times[0] || 0)) / duration * 100}%` }} />
              {track.times.filter((_, index) => index === 0 || index === track.times.length - 1 || index % Math.max(1, Math.ceil(track.times.length / 36)) === 0).map((time) =>
                <span key={time} className={`keyframe ${track.channel === 'deform' ? 'deform' : ''}`} title={`${track.label} · ${time.toFixed(3)}s`}
                  style={{ left: `${time / duration * 100}%` }} />)}
            </div>)}
            {!tracks.length && <div className="empty-track-space" />}
          </div>
          <div className="playhead" style={{ left: `${frame.time / duration * 100}%` }}><span /></div>
        </div>
      </div>
    </div>
  </section>;
}

export default function App() {
  const [projects, setProjects] = useState<Manifest[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [data, setData] = useState<ProjectData | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [projectRevision, setProjectRevision] = useState(0);
  const [requestState, setRequestState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [libraryError, setLibraryError] = useState('');
  const [search, setSearch] = useState('');
  const [targetFilter, setTargetFilter] = useState('all');
  const [libraryTab, setLibraryTab] = useState<'projects' | 'bones'>('projects');
  const [inspectorTab, setInspectorTab] = useState<'properties' | 'files'>('properties');
  const [showLibrary, setShowLibrary] = useState(() => window.innerWidth >= 800);
  const [showInspector, setShowInspector] = useState(() => window.innerWidth >= 1100);
  const [compare, setCompare] = useState(false);
  const [animation, setAnimation] = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [collapsedBones, setCollapsedBones] = useState<Set<string>>(new Set());
  const [settings, setSettings] = useState<ViewSettings>({ background: 'dark', bones: false, wireframe: false,
    zoom: 1.25, speed: 1, loop: true, selectedBone: null });
  const [dragging, setDragging] = useState(false);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const downloadMenu = useRef<HTMLDivElement>(null);
  const shortcuts = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const projectRequest = useRef<AbortController | null>(null);
  const selectedAnimation = data?.preview.skeleton.animations[animation] ? animation : Object.keys(data?.preview.skeleton.animations || {})[0] || '';
  const preview = usePreview(canvas, data, settings, selectedAnimation);
  const ready = requestState === 'ready' && ['ready', 'partial'].includes(preview.load.phase) && !!data;
  const failed = requestState === 'error' || (requestState === 'ready' && !!data && preview.load.phase === 'error');
  const selectedManifest = data?.manifest || projects.find((project) => project.id === activeId);
  const tracks = useMemo(() => animationTracks(data?.preview.skeleton.animations[selectedAnimation]), [data, selectedAnimation]);
  const selectedBone = data?.preview.skeleton.bones.find((bone) => bone.name === settings.selectedBone);
  const selectedPart = data?.preview.analysis?.parts?.find((part) => part.name === settings.selectedBone);
  const visibleProjects = projects.filter((project) => (!search || `${project.title} ${project.name} ${project.project} ${project.target.label}`.toLowerCase().includes(search.toLowerCase()))
    && (targetFilter === 'all' || project.target.id === targetFilter));
  const targets = [...new Map(projects.map((project) => [project.target.id, project.target])).values()];
  const engineFiles = data?.manifest.files.filter((file) => ['json', 'atlas', 'texture'].includes(file.kind)) || [];
  const otherFiles = data?.manifest.files.filter((file) => !['json', 'atlas', 'texture'].includes(file.kind)) || [];

  useEffect(() => {
    const abort = new AbortController();
    getJson<{ projects: Manifest[] }>('/api/projects', abort.signal).then(({ projects: items }) => {
      if (abort.signal.aborted) return;
      projectRequest.current?.abort();
      setProjects(items); setLibraryError('');
      const requested = new URLSearchParams(location.search).get('project');
      setActiveId((previous) => items.some((project) => project.id === previous) ? previous
        : items.some((project) => project.id === requested) ? requested : items[0]?.id || null);
      if (items.length) {
        setRequestState('loading');
        setProjectRevision((value) => value + 1);
      } else {
        setData(null); setRequestState('ready'); setAnimation(''); setError('');
        history.replaceState(null, '', '/');
        document.title = 'Spine Studio · 动画工作台';
      }
    }).catch((failure: Error) => {
      if (!abort.signal.aborted && failure.name !== 'AbortError') {
        setLibraryError('无法连接本地预览服务');
        setError('无法读取作品，请确认预览服务已启动后重试。'); setRequestState('error');
      }
    });
    return () => abort.abort();
  }, [refresh]);

  useEffect(() => {
    if (!activeId) { setData(null); return; }
    const abort = new AbortController();
    projectRequest.current = abort;
    setRequestState('loading'); setData(null); setError(''); setDownloadOpen(false);
    getJson<ProjectData>(`/api/project?id=${encodeURIComponent(activeId)}`, abort.signal).then((project) => {
      if (abort.signal.aborted) return;
      setData(project); setRequestState('ready');
      setCollapsedBones(new Set());
      setViewPan({ x: 0, y: 0 });
      setSettings((previous) => ({ ...previous, loop: project.manifest.loop, selectedBone: null }));
      history.replaceState(null, '', `/?project=${encodeURIComponent(activeId)}`);
      document.title = `${project.manifest.title || project.manifest.name} · Spine Studio`;
    }).catch((failure: Error) => {
      if (!abort.signal.aborted && failure.name !== 'AbortError') { setError(failure.message); setRequestState('error'); }
    });
    return () => { abort.abort(); if (projectRequest.current === abort) projectRequest.current = null; };
  }, [activeId, projectRevision]);

  useEffect(() => {
    if (!downloadOpen) return;
    const close = (event: globalThis.PointerEvent) => { if (!downloadMenu.current?.contains(event.target as Node)) setDownloadOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [downloadOpen]);

  useEffect(() => {
    if (shortcutsOpen && !shortcuts.current?.open) shortcuts.current?.showModal();
    if (!shortcutsOpen && shortcuts.current?.open) shortcuts.current?.close();
  }, [shortcutsOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setShowLibrary(true); setLibraryTab('projects');
        requestAnimationFrame(() => searchInput.current?.focus()); return;
      }
      if (event.key === 'Escape') { setDownloadOpen(false); setShortcutsOpen(false); return; }
      if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes((event.target as HTMLElement)?.tagName) || shortcutsOpen) return;
      if (!ready) return;
      if (event.code === 'Space') { event.preventDefault(); preview.controls.toggle(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); preview.controls.step(event.key === 'ArrowLeft' ? -1 : 1); }
      if (event.key.toLowerCase() === 'f') { preview.controls.fit(); setViewPan({ x: 0, y: 0 }); setSettings((previous) => ({ ...previous, zoom: 1 })); }
      if (event.key.toLowerCase() === 'b') setSettings((previous) => ({ ...previous, bones: !previous.bones }));
      if (event.key.toLowerCase() === 'm') setSettings((previous) => ({ ...previous, wireframe: !previous.wireframe }));
      if (event.key === '?') setShortcutsOpen(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const selectBone = (name: string) => {
    setSettings((previous) => ({ ...previous, selectedBone: name, bones: true }));
    setInspectorTab('properties'); setShowInspector(true);
    if (window.innerWidth < 800) setShowLibrary(false);
  };
  const selectProject = (id: string) => { setActiveId(id); if (window.innerWidth < 800) setShowLibrary(false); };
  const updateBackground = (background: Background) => setSettings((previous) => ({ ...previous, background }));
  const changeZoom = (value: number, x?: number, y?: number) => {
    const zoom = clampZoom(value); preview.controls.zoomAt(zoom, x, y);
    setViewPan({ x: preview.instance.current?.panX || 0, y: preview.instance.current?.panY || 0 });
    setSettings((previous) => ({ ...previous, zoom }));
  };
  const pointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!ready || ![0, 1].includes(event.button)) return;
    event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, panX: preview.instance.current?.panX || 0, panY: preview.instance.current?.panY || 0 };
    setDragging(true);
  };
  const pointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const x = drag.current.panX + event.clientX - drag.current.x;
    const y = drag.current.panY + event.clientY - drag.current.y;
    preview.controls.pan(x, y); setViewPan({ x, y });
  };
  const endDrag = () => { drag.current = null; setDragging(false); };
  const showFiles = () => { setShowInspector(true); setInspectorTab('files'); setDownloadOpen(false); };
  const boneDepth = (name: string) => {
    let depth = 0, bone = data?.preview.skeleton.bones.find((item) => item.name === name);
    const visited = new Set<string>();
    while (bone?.parent && !visited.has(bone.name)) { visited.add(bone.name); depth++; bone = data?.preview.skeleton.bones.find((item) => item.name === bone!.parent); }
    return depth;
  };
  const visibleBones = data?.preview.skeleton.bones.filter((bone) => {
    let parent = bone.parent;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (collapsedBones.has(parent)) return false;
      visited.add(parent); parent = data.preview.skeleton.bones.find((item) => item.name === parent)?.parent;
    }
    return true;
  }) || [];
  const toggleBone = (name: string) => setCollapsedBones((previous) => {
    const next = new Set(previous); if (next.has(name)) next.delete(name); else next.add(name); return next;
  });

  return <div className={`studio-shell ${!showLibrary ? 'hide-library' : ''} ${!showInspector ? 'hide-inspector' : ''}`}>
    <header className="studio-header">
      <a href="/" className="studio-brand" aria-label="Spine Studio 首页"><span className="brand-symbol"><Layers3 size={20} /></span><strong>Spine<span>Studio</span></strong></a>
      <span className="header-separator" />
      <div className="workspace-crumb"><FolderOpen size={14} /><span>动画工作区</span><ChevronRight size={12} /><b>{selectedManifest?.name || '未选择作品'}</b></div>
      <span className="header-mode"><span className="status-dot" />本地预览</span>
      <div className="header-buttons"><IconButton icon={PanelLeftClose} label={showLibrary ? '收起资源面板' : '显示资源面板'} active={showLibrary} onClick={() => setShowLibrary(!showLibrary)} />
        <IconButton icon={PanelRightClose} label={showInspector ? '收起检查器' : '显示检查器'} active={showInspector} onClick={() => setShowInspector(!showInspector)} />
        <span className="thin-divider" />
        <div className="download-menu" ref={downloadMenu}>
          <button className="export-button" disabled={!ready} onClick={() => setDownloadOpen(!downloadOpen)} aria-expanded={downloadOpen} aria-label="下载引擎资源"><Download size={14} /><span>下载资源</span><ChevronDown size={12} /></button>
          {downloadOpen && <div className="download-popover"><div className="popover-heading">{shortTarget(data?.manifest.target)} 引擎资源</div><FileList files={engineFiles} />
            <button className="popover-footer" onClick={showFiles}>查看全部文件<ArrowUpRight size={13} /></button></div>}
        </div>
      </div>
    </header>

    <main className="workbench">
      <nav className="activity-rail" aria-label="工作台面板">
        <IconButton icon={FolderOpen} label="资源库" active={showLibrary && libraryTab === 'projects'} onClick={() => { setShowLibrary(true); setLibraryTab('projects'); }} />
        <IconButton icon={GitBranch} label="骨骼结构" active={showLibrary && libraryTab === 'bones'} onClick={() => { setShowLibrary(true); setLibraryTab('bones'); }} />
        <IconButton icon={Files} label="导出文件" active={showInspector && inspectorTab === 'files'} onClick={showFiles} />
        <div className="rail-spacer" /><IconButton icon={CircleHelp} label="快捷键与操作说明" onClick={() => setShortcutsOpen(true)} />
      </nav>

      <aside className="library-panel">
        <div className="panel-heading"><div className="panel-tabs"><button className={libraryTab === 'projects' ? 'active' : ''} onClick={() => setLibraryTab('projects')}>资源库<span>{projects.length}</span></button>
          <button className={libraryTab === 'bones' ? 'active' : ''} onClick={() => setLibraryTab('bones')}>骨骼</button></div>
          <IconButton id="refreshBtn" icon={RefreshCw} label="刷新作品" onClick={() => setRefresh((value) => value + 1)} />
        </div>
        {libraryTab === 'projects' ? <>
          <div className="library-search"><Search size={13} /><input ref={searchInput} aria-label="搜索作品" placeholder="搜索作品…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>⌘ K</kbd></div>
          <div className="library-filter"><span>全部作品</span><select aria-label="筛选导出目标" value={targetFilter} onChange={(event) => setTargetFilter(event.target.value)}><option value="all">全部目标</option>{targets.map((target) => <option key={target.id} value={target.id}>{shortTarget(target)}</option>)}</select></div>
          <div className="asset-list">{visibleProjects.map((project) => <button key={project.id} className={`asset-card ${project.id === activeId ? 'selected' : ''}`}
            data-project={project.id} onClick={() => selectProject(project.id)} title={`${project.title || project.name} · ${project.project}`}>
            <span className="asset-thumbnail checkerboard"><img src={cached(project.sourceUrl, project.createdAt)} alt="" loading="lazy" /></span>
            <span className="asset-info"><strong>{project.title || project.name}</strong><span>{shortTarget(project.target)}<i />{project.animations.length} 个动画</span></span>
            {project.id === activeId && <span className="asset-selected-dot" />}
          </button>)}
            {!visibleProjects.length && <div className="library-empty"><FolderOpen size={26} /><strong>{search || targetFilter !== 'all' ? '没有匹配的作品' : '工作区还没有作品'}</strong><span>{search || targetFilter !== 'all' ? '试试其他名称或导出目标' : '生成动画后，点击刷新查看'}</span></div>}
          </div>
          <div className="library-bottom"><Box size={12} /><span>{visibleProjects.length} 个作品</span><span className="muted">{projects.reduce((sum, project) => sum + project.animations.length, 0)} 个动画</span></div>
        </> : <>
          <div className="tree-caption"><span>场景层级</span><span>{data?.preview.skeleton.bones.length || 0} BONES</span></div>
          <div className="bone-tree">{visibleBones.map((bone) => {
            const hasChildren = data!.preview.skeleton.bones.some((item) => item.parent === bone.name);
            return <div key={bone.name} className={`bone-row ${bone.name === settings.selectedBone ? 'selected' : ''}`}
              style={{ paddingLeft: `${8 + boneDepth(bone.name) * 14}px` }}>
              {hasChildren ? <button className="tree-expander" aria-label={`${collapsedBones.has(bone.name) ? '展开' : '收起'}${friendlyBone(bone.name)}子骨骼`}
                aria-expanded={!collapsedBones.has(bone.name)} onClick={() => toggleBone(bone.name)}>{collapsedBones.has(bone.name) ? <ChevronRight size={11} /> : <ChevronDown size={11} />}</button> : <span className="tree-expander-placeholder" />}
              <button className="bone-select" aria-label={`选择骨骼 ${friendlyBone(bone.name)}`} onClick={() => selectBone(bone.name)}><Bone size={13} /><span>{friendlyBone(bone.name)}<small>{bone.name}</small></span></button>
            </div>;
          })}{!data && <p className="panel-empty">选择作品后查看骨骼结构</p>}</div>
          <div className="library-bottom"><GitBranch size={12} />点击骨骼查看初始姿态</div>
        </>}
      </aside>

      <section className="viewport-panel" aria-label="动画画布">
        <div className="viewport-toolbar"><div className="viewport-label"><Triangle size={12} /><span>动画视图</span><span className="muted-tag">2D</span></div>
          <div className="viewport-tools"><IconButton icon={Columns2} label="原图对照" active={compare} disabled={!ready} onClick={() => setCompare(!compare)} />
            <span className="thin-divider" /><IconButton icon={Bone} label="显示骨骼 B" active={settings.bones} disabled={!ready} onClick={() => setSettings((previous) => ({ ...previous, bones: !previous.bones }))} />
            <IconButton icon={Grid2X2} label="显示网格 M" active={settings.wireframe} disabled={!ready} onClick={() => setSettings((previous) => ({ ...previous, wireframe: !previous.wireframe }))} />
            <span className="thin-divider" />
            <div className="background-buttons" aria-label="预览背景">
              <IconButton icon={Moon} label="深色背景" active={settings.background === 'dark'} onClick={() => updateBackground('dark')} />
              <IconButton icon={Sun} label="浅色背景" active={settings.background === 'light'} onClick={() => updateBackground('light')} />
              <IconButton icon={Box} label="透明棋盘格" active={settings.background === 'checker'} onClick={() => updateBackground('checker')} />
            </div>
          </div>
        </div>
        <div className="scene-heading"><div><span className="scene-eyebrow">CURRENT SCENE</span><h1 id="assetTitle">{selectedManifest?.title || selectedManifest?.name || '动画工作台'}</h1></div>
          {selectedManifest && <span className="scene-format">{shortTarget(selectedManifest.target)}<span>Spine {selectedManifest.target.spine}</span></span>}
        </div>
        <div className={`stage-layout ${compare ? 'comparing' : ''}`}>
          {compare && data && <div className={`reference-pane scene-background-${settings.background}`}><span className="pane-label"><ImageIcon size={12} />原始素材</span><img src={cached(data.manifest.inputUrl || data.manifest.sourceUrl, data.manifest.createdAt)} alt="角色原始素材对照"
            style={{ transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${settings.zoom})` }} /></div>}
          <div className={`canvas-host scene-background-${settings.background} ${dragging ? 'is-dragging' : ''}`}>
            {compare && <span className="pane-label"><Activity size={12} />动画预览</span>}
            <canvas id="animationCanvas" ref={canvas} aria-label="Spine 动画预览" tabIndex={0} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}
              onWheel={(event) => { if (ready) changeZoom(settings.zoom * (event.deltaY > 0 ? 0.9 : 1.1), event.clientX, event.clientY); }} />
            {!ready && <div className="canvas-placeholder">{failed ? <CircleAlert size={32} /> : <Layers3 size={36} />}
              <strong>{failed ? '作品暂时无法载入' : !projects.length && requestState === 'ready' ? '从这里开始你的动画' : '正在准备画布'}</strong>
              <span>{requestState === 'loading' ? '正在读取作品数据…' : error || preview.load.message || '生成作品后，它将出现在左侧资源库中。'}</span>
              {failed && <button className="secondary-button" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={13} />重新载入</button>}
            </div>}
            {data && <div className="canvas-meta"><span className="canvas-coordinate">{data.manifest.imageSize.width} × {data.manifest.imageSize.height}</span><span><Hand size={11} />拖动画布平移</span></div>}
          </div>
        </div>
        <div className="viewport-bottom"><div className="viewport-ready" role="status" id="status"><span className={`status-dot ${!ready ? 'waiting' : preview.load.phase === 'partial' ? 'warning' : ''}`} />
          {requestState === 'loading' ? '正在读取作品…' : requestState === 'error' ? error : ready ? preview.load.message : preview.load.message || '选择或生成一个动画作品'}</div>
          <div className="zoom-tools"><IconButton icon={ZoomOut} label="缩小画布" disabled={!ready} onClick={() => changeZoom(settings.zoom - 0.1)} />
            <button className="zoom-value" onClick={() => { preview.controls.fit(); changeZoom(1); }} disabled={!ready} title="恢复适应画布">{Math.round(settings.zoom * 100)}%</button>
            <IconButton icon={ZoomIn} label="放大画布" disabled={!ready} onClick={() => changeZoom(settings.zoom + 0.1)} />
            <span className="thin-divider" /><IconButton icon={Maximize2} label="适应画布 F" disabled={!ready} onClick={() => { preview.controls.fit(); changeZoom(1); }} /></div>
        </div>
        <div className="transport-bar"><div className="transport-left"><IconButton icon={Repeat2} label="循环播放" active={settings.loop} disabled={!ready} onClick={() => setSettings((previous) => ({ ...previous, loop: !previous.loop }))} />
          <select aria-label="播放速度" value={settings.speed} onChange={(event) => setSettings((previous) => ({ ...previous, speed: Number(event.target.value) }))} disabled={!ready}>
            <option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}>1×</option><option value={1.5}>1.5×</option><option value={2}>2×</option></select></div>
          <div className="playback-buttons"><IconButton icon={ChevronsLeft} label="跳到开头" disabled={!ready} onClick={() => preview.controls.seek(0)} />
            <IconButton id="previousBtn" icon={SkipBack} label="上一帧" disabled={!ready} onClick={() => preview.controls.step(-1)} />
            <IconButton id="playBtn" className="play-button" icon={preview.frame.playing ? Pause : Play} label={preview.frame.playing ? '暂停' : '播放'} disabled={!ready} onClick={() => preview.controls.toggle()} />
            <IconButton id="nextBtn" icon={SkipForward} label="下一帧" disabled={!ready} onClick={() => preview.controls.step(1)} />
            <IconButton icon={ChevronsRight} label="跳到末尾" disabled={!ready} onClick={() => preview.controls.seek(preview.frame.duration)} /></div>
          <output className="transport-time" id="timeLabel">{timecode(preview.frame.time)}<span>/ {timecode(preview.frame.duration)}</span></output>
        </div>
      </section>

      <aside className="inspector-panel">
        <div className="panel-heading"><div className="panel-tabs"><button className={inspectorTab === 'properties' ? 'active' : ''} onClick={() => setInspectorTab('properties')}>检查器</button>
          <button className={inspectorTab === 'files' ? 'active' : ''} onClick={() => setInspectorTab('files')}>导出文件</button></div><Settings2 size={14} className="panel-heading-icon" /></div>
        <div className="inspector-scroll">{data ? inspectorTab === 'files' ? <>
          <div className="inspector-section"><div className="section-label"><Download size={13} /><h2>引擎资源</h2><span>{engineFiles.length}</span></div><p className="section-note">将同名文件放在同一目录导入 {shortTarget(data.manifest.target)}。</p><FileList files={engineFiles} /></div>
          {!!otherFiles.length && <div className="inspector-section"><div className="section-label"><Files size={13} /><h2>素材与附件</h2></div><FileList files={otherFiles} /></div>}
          <div className="export-version"><Check size={14} /><div><strong>Spine {data.manifest.target.spine}</strong><span>按 {shortTarget(data.manifest.target)} 目标导出</span><span>{new Date(data.manifest.createdAt).toLocaleString('zh-CN')}</span></div></div>
        </> : <>
          <div className="inspector-section inspector-selection"><div className="selection-symbol">{selectedBone ? <Bone size={22} /> : <Box size={22} />}</div><div><h2>{selectedBone ? friendlyBone(selectedBone.name) : data.manifest.title || data.manifest.name}</h2><span>{selectedBone?.name || data.manifest.name}</span></div><span className="muted-tag">{selectedBone ? 'BONE' : 'SCENE'}</span></div>
          {selectedBone ? <div className="inspector-section"><div className="section-label"><SlidersHorizontal size={13} /><h2>初始姿态</h2><span>只读</span></div>
            <Property name="父级" value={selectedBone.parent ? friendlyBone(selectedBone.parent) : '场景根节点'} />
            <div className="property-pair"><Property name="X" value={number(selectedBone.x)} /><Property name="Y" value={number(selectedBone.y)} /></div>
            <Property name="旋转" value={number(selectedBone.rotation)} suffix="°" />
            {selectedPart && <><div className="section-sublabel">素材区域</div><div className="property-pair"><Property name="宽" value={number(selectedPart.bbox.width)} /><Property name="高" value={number(selectedPart.bbox.height)} /></div><Property name="绘制层级" value={selectedPart.depth} /></>}
          </div> : <div className="inspector-section"><div className="section-label"><SlidersHorizontal size={13} /><h2>场景属性</h2></div><Property name="画布" value={`${data.manifest.imageSize.width} × ${data.manifest.imageSize.height}`} suffix="px" />
            <div className="property-pair"><Property name="骨骼" value={data.manifest.bones} /><Property name="区域" value={data.manifest.partCount || data.manifest.slots} /></div>
            <Property name="纹理" value={data.manifest.slots} /><Property name="动画" value={data.manifest.animations.length} />
          </div>}
          <div className="inspector-section"><div className="section-label"><Layers3 size={13} /><h2>素材</h2>{data.manifest.transparency?.after.hasClearBackground && <span className="alpha-tag">RGBA</span>}</div>
            <div className="source-preview checkerboard"><img id="sourceImage" src={cached(data.manifest.inputUrl || data.manifest.sourceUrl, data.manifest.createdAt)} alt="角色原始素材" /></div>
            <div className="source-caption"><ImageIcon size={11} /><span>{data.manifest.name}.png</span><span>{data.manifest.imageSize.width} × {data.manifest.imageSize.height}</span></div>
          </div>
          <div className="inspector-section"><div className="section-label"><Box size={13} /><h2>导出设置</h2></div><Property name="目标引擎" value={shortTarget(data.manifest.target)} /><Property name="Spine 版本" value={data.manifest.target.spine} />
            {data.manifest.blink && <div className="feature-line"><CheckCheck size={13} /><span>含眨眼动画</span></div>}
            <button className="inspector-link" onClick={showFiles}>查看导出文件<ArrowUpRight size={13} /></button>
          </div>
          <div className="inspector-section"><div className="section-label"><ImageIcon size={13} /><h2>处理信息</h2></div>
            <Property name="处理方式" value={data.manifest.segmentation?.backend === 'mesh' ? '整图蒙皮' : data.manifest.segmentation?.backend || '未记录'} />
            <Property name="透明背景" value={data.manifest.transparency?.after?.hasClearBackground ? '真实 alpha' : data.manifest.transparency?.after?.meaningfulAlpha ? '含透明度' : '未记录 / 不透明'} />
            <Property name="边缘修复" value={data.manifest.transparency?.correctedEdgePixels === undefined ? '未记录' : number(data.manifest.transparency.correctedEdgePixels)} suffix={data.manifest.transparency?.correctedEdgePixels === undefined ? undefined : 'px'} />
            {data.manifest.transparency?.spillBefore !== undefined && <Property name="疑似残色" value={`${number(data.manifest.transparency.spillBefore)} → ${number(data.manifest.transparency.spillAfter)}`} />}
          </div>
          {!!data.manifest.warnings.length && <div className="inspector-section warnings-section"><div className="section-label"><CircleAlert size={13} /><h2>检查提示</h2></div>{data.manifest.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
        </> : <div className="inspector-empty"><SlidersHorizontal size={27} /><strong>检查器</strong><p>选择作品或骨骼，查看属性和导出资源。</p></div>}</div>
      </aside>

      <Timeline data={data} name={selectedAnimation} frame={preview.frame} tracks={tracks} selectedBone={settings.selectedBone}
        onSelect={selectBone} onSeek={preview.controls.seek} onAnimation={setAnimation} disabled={!ready} />
    </main>

    <footer className="status-bar"><div><span className={`status-dot ${libraryError ? 'warning' : ''}`} /><span>{libraryError || '本地工作区'}</span><span className="footer-divider">/</span><span>{projects.length} 个作品</span></div>
      <div className="keyboard-tips"><kbd>Space</kbd>播放 / 暂停<span>·</span><kbd>← →</kbd>逐帧<span>·</span><kbd>F</kbd>适应画布</div>
      <div>{selectedManifest && <><Box size={11} /><span>{shortTarget(selectedManifest.target)}</span><span className="footer-divider">/</span><span>Spine {selectedManifest.target.spine}</span></>}</div>
    </footer>

    <dialog ref={shortcuts} className="shortcuts-dialog" onClose={() => setShortcutsOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false); }}>
      <div className="dialog-heading"><div><span className="scene-eyebrow">WORKSPACE GUIDE</span><h2>让检查更顺手</h2></div><IconButton icon={X} label="关闭快捷键说明" onClick={() => setShortcutsOpen(false)} /></div>
      <p>在画布中拖动来平移，滚动鼠标滚轮缩放。</p>
      {[["Space", "播放 / 暂停"], ["← / →", "上一帧 / 下一帧"], ["F", "适应画布"], ["B", "显示 / 隐藏骨骼"], ["M", "显示 / 隐藏网格"], ["⌘ / Ctrl K", "搜索作品"]].map(([key, action]) => <div className="shortcut-row" key={key}><span>{action}</span><kbd>{key}</kbd></div>)}
    </dialog>
  </div>;
}
