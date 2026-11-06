import { SpinePreview } from '/renderer.js';

const byId = (id) => document.getElementById(id);
const preview = new SpinePreview(byId('animationCanvas'));
let projects = [], activeId = null, scrubbing = false;
const status = (text, error = false) => { byId('status').textContent = text; byId('status').classList.toggle('error', error); };
const cached = (url, version) => `${url}?v=${encodeURIComponent(version)}`;
const get = async (url) => {
  const response = await fetch(url, { cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `读取作品失败 (${response.status})`);
  return data;
};

function renderLibrary() {
  byId('projectList').replaceChildren();
  byId('projectCount').textContent = projects.length;
  byId('emptyLibrary').hidden = projects.length > 0;
  for (const project of projects) {
    const button = document.createElement('button');
    button.className = `project-button${project.id === activeId ? ' active' : ''}`;
    button.dataset.project = project.id;
    button.title = `${project.title || project.name}\n${project.project} / ${project.name}`;
    const image = document.createElement('img'); image.className = 'project-thumb'; image.alt = '';
    image.src = cached(project.sourceUrl, project.createdAt);
    const info = document.createElement('div'); info.className = 'project-info';
    const name = document.createElement('div'); name.className = 'project-name'; name.textContent = project.title || project.name;
    const meta = document.createElement('div'); meta.className = 'project-meta'; meta.textContent = `${project.bones} 骨骼 · ${project.animations.length} 动画`;
    info.append(name, meta); button.append(image, info);
    button.addEventListener('click', () => loadProject(project.id).catch((error) => status(error.message, true)));
    byId('projectList').append(button);
  }
}

async function loadProject(id) {
  status('正在载入动画…');
  const { manifest, preview: state } = await get(`/api/project?id=${encodeURIComponent(id)}`);
  preview.stop(); preview.reset(); preview.setLoop(manifest.loop);
  byId('loopToggle').checked = manifest.loop;
  preview.showBones = byId('bonesToggle').checked;
  const images = new Map(state.imageUrls.map(([name, url]) => [name, cached(url, manifest.createdAt)]));
  const loaded = await preview.load(state.skeleton, images, state.imageSize);
  preview.start(); activeId = id;
  byId('stageEmpty').hidden = true; byId('details').hidden = false;
  byId('assetTitle').textContent = manifest.title || manifest.name;
  byId('assetSubtitle').textContent = `${manifest.project}  /  ${manifest.target.label}`;
  byId('blinkBadge').hidden = !manifest.blink;
  byId('sourceImage').src = cached(manifest.inputUrl || manifest.sourceUrl, manifest.createdAt);
  byId('imageSize').textContent = `${manifest.imageSize.width} × ${manifest.imageSize.height} px`;
  byId('boneCount').textContent = `${manifest.bones} / ${manifest.partCount ?? manifest.slots}`;
  byId('slotCount').textContent = manifest.slots;
  byId('targetLabel').textContent = manifest.target.label;
  byId('spineVersion').textContent = manifest.target.spine;
  const alpha = manifest.transparency, segmentation = manifest.segmentation;
  byId('processingCard').hidden = !alpha && !segmentation;
  byId('alphaLabel').textContent = alpha?.after?.hasClearBackground ? '真实 alpha' : alpha?.after?.meaningfulAlpha ? '含透明度' : '未记录 / 不透明';
  byId('edgeLabel').textContent = alpha?.correctedEdgePixels ? `${alpha.correctedEdgePixels.toLocaleString()} 像素` : '保留原色';
  byId('segmentationLabel').textContent = segmentation?.backend === 'mesh' ? '整图蒙皮 · 不拆图'
    : segmentation?.backend === 'mobilesam' ? `MobileSAM · ${segmentation.samParts.length} 个掩码`
    : segmentation?.backend === 'sam3' ? `SAM 3 · ${segmentation.samParts.length} 个掩码` : '多边形轮廓';
  byId('spillLabel').textContent = alpha?.spillBefore ? `疑似边缘溢色 ${alpha.spillBefore.toLocaleString()} → ${(alpha.spillAfter ?? 0).toLocaleString()} 像素` : '';
  byId('createdAt').textContent = new Date(manifest.createdAt).toLocaleString('zh-CN');
  byId('animationSelect').replaceChildren(...Object.keys(state.skeleton.animations).map((name) => {
    const option = document.createElement('option'); option.value = name; option.textContent = name; return option;
  }));
  byId('zoomSlider').value = '1'; byId('zoomLabel').textContent = '1.00×';
  for (const id of ['playBtn', 'restartBtn', 'previousBtn', 'nextBtn', 'timeline', 'animationSelect']) byId(id).disabled = false;
  byId('downloads').replaceChildren(...manifest.files.map((file) => {
    const link = document.createElement('a'); link.className = 'download-link';
    link.href = file.url; link.download = file.name;
    const label = { json: '骨架 JSON', atlas: '图集 ATLAS', texture: '贴图 PNG', source: '透明源图 PNG' }[file.kind] || file.name;
    link.append(document.createTextNode(label)); const icon = document.createElement('span'); icon.textContent = '↓'; link.append(icon); return link;
  }));
  byId('warnings').replaceChildren(...manifest.warnings.map((warning) => { const item = document.createElement('li'); item.textContent = warning; return item; }));
  byId('notes').hidden = manifest.warnings.length === 0;
  history.replaceState(null, '', `/?project=${encodeURIComponent(id)}`);
  renderLibrary();
  status(loaded === images.size ? '动画已就绪，可以播放、逐帧查看或下载文件。' : `有 ${images.size - loaded} 张贴图未能加载，请检查产物目录。`, loaded !== images.size);
}

async function refresh() {
  projects = (await get('/api/projects')).projects;
  renderLibrary();
  if (!projects.length) { status('等待第一个动画作品。'); return; }
  const requested = new URLSearchParams(location.search).get('project');
  const id = projects.some((item) => item.id === activeId) ? activeId
    : projects.some((item) => item.id === requested) ? requested : projects[0].id;
  await loadProject(id);
}

preview.onFrame = (time, duration, playing) => {
  if (!scrubbing) byId('timeline').value = Math.round(time / duration * 1000);
  byId('timeLabel').textContent = `${time.toFixed(2)} / ${duration.toFixed(2)}s`;
  byId('playBtn').textContent = playing ? '暂停' : '播放';
};
byId('playBtn').addEventListener('click', () => preview.togglePlay());
byId('restartBtn').addEventListener('click', () => { preview.seek(0); preview.play(); });
byId('previousBtn').addEventListener('click', () => preview.step(-1));
byId('nextBtn').addEventListener('click', () => preview.step(1));
byId('timeline').addEventListener('pointerdown', () => { scrubbing = true; });
byId('timeline').addEventListener('pointerup', () => { scrubbing = false; });
byId('timeline').addEventListener('input', (event) => preview.seek(Number(event.target.value) / 1000 * preview.duration));
byId('loopToggle').addEventListener('change', (event) => preview.setLoop(event.target.checked));
byId('bonesToggle').addEventListener('change', (event) => { preview.showBones = event.target.checked; });
byId('backgroundSelect').addEventListener('change', (event) => { preview.background = event.target.value; });
byId('zoomSlider').addEventListener('input', (event) => { preview.setZoom(Number(event.target.value)); byId('zoomLabel').textContent = `${Number(event.target.value).toFixed(2)}×`; });
byId('animationSelect').addEventListener('change', (event) => { preview.playAnimation(event.target.value); preview.play(); });
byId('refreshBtn').addEventListener('click', () => refresh().catch((error) => status(error.message, true)));
window.addEventListener('resize', () => preview.resize());
document.addEventListener('keydown', (event) => {
  if (!activeId || ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); preview.togglePlay(); }
  if (event.code === 'ArrowLeft') { event.preventDefault(); preview.step(-1); }
  if (event.code === 'ArrowRight') { event.preventDefault(); preview.step(1); }
});
refresh().catch((error) => status(error.message, true));
