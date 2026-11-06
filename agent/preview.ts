import express from 'express';
import { access, mkdir, open, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { Manifest } from './types.js';
import { previewAssets } from '../skills/spine-animation/scripts/environment.mjs';

export const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = 'spine-animation-preview';
const protocol = 2;
interface PreviewCache { stamp: string; paths: string[] }

async function fileStamp(file: string) {
  try { const info = await stat(file); return `${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`; }
  catch { return 'missing'; }
}

function outputFile(output: string, url: unknown) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url, 'http://preview.local');
    if (parsed.origin !== 'http://preview.local' || !parsed.pathname.startsWith('/output/')) return null;
    const file = resolve(output, decodeURIComponent(parsed.pathname.slice('/output/'.length)));
    return file.startsWith(output + sep) ? file : null;
  } catch { return null; }
}

async function projectRevision(output: string, manifest: Manifest, manifestFile: string, text: string,
  cache: Map<string, PreviewCache>) {
  const previewFile = resolve(output, manifest.previewFile);
  if (!previewFile.startsWith(output + sep)) return 'invalid-preview-path';
  const stamp = await fileStamp(previewFile);
  let preview = cache.get(previewFile);
  if (preview?.stamp !== stamp) {
    const paths: string[] = [];
    try {
      const state = JSON.parse(await readFile(previewFile, 'utf8'));
      for (const value of [state.sourceUrl, ...(Array.isArray(state.imageUrls) ? state.imageUrls.map((item: unknown[]) => item?.[1]) : [])]) {
        const file = outputFile(output, value); if (file) paths.push(file);
      }
    } catch { /* Incomplete candidates return 409 from the project endpoint. */ }
    preview = { stamp, paths }; cache.set(previewFile, preview);
  }
  const paths = new Set([manifestFile, previewFile, ...preview.paths]);
  for (const value of [manifest.sourceUrl, manifest.inputUrl, ...manifest.files.map((file) => file.url)]) {
    const file = outputFile(output, value); if (file) paths.add(file);
  }
  const signatures = await Promise.all([...paths].sort().map(async (file) => `${file}:${await fileStamp(file)}`));
  return createHash('sha256').update(text).update(signatures.join('\n')).digest('hex').slice(0, 24);
}

export async function listProjects(output: string, cache = new Map<string, PreviewCache>()): Promise<Manifest[]> {
  const projects = await readdir(output, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(projects.filter((entry) => entry.isDirectory()).map(async (project) => {
    const directory = join(output, project.name);
    const sources = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return Promise.all(sources.filter((entry) => entry.isDirectory() && entry.name.endsWith('_temp')).map(async (source) => {
      try {
        const file = join(directory, source.name, 'manifest.json');
        const text = await readFile(file, 'utf8');
        const item = JSON.parse(text) as Manifest;
        if (item.version !== 1 || item.id !== `${project.name}/${source.name.slice(0, -5)}`) return null;
        return { ...item, revision: await projectRevision(output, item, file, text, cache) };
      } catch { return null; }
    }));
  }));
  const items = results.flat().filter((item) => item !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const valid = new Set(items.map((item) => resolve(output, item.previewFile)));
  for (const key of cache.keys()) if (!valid.has(key)) cache.delete(key);
  return items;
}

export function createPreviewApp(outputDirectory: string) {
  const output = resolve(outputDirectory), app = express();
  const web = previewAssets(runtimeRoot);
  const cache = new Map<string, PreviewCache>();
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service, output,
    web: resolve(web.directory).slice(runtimeRoot.length + 1), viewer: web.layout, protocol }));
  app.get('/api/projects', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ projects: await listProjects(output, cache) });
  });
  app.get('/api/project', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const manifest = (await listProjects(output, cache)).find((project) => project.id === id);
    if (!manifest) return res.status(404).json({ error: '没有找到这个动画项目' });
    const file = resolve(output, manifest.previewFile);
    if (!file.startsWith(output + sep)) return res.status(400).json({ error: '预览路径无效' });
    try {
      const preview = JSON.parse(await readFile(file, 'utf8'));
      return res.set('Cache-Control', 'no-store').json({ manifest, preview });
    } catch { return res.status(409).json({ error: '预览数据尚未完成，请稍后刷新' }); }
  });
  app.use('/output', express.static(output, { etag: false, maxAge: 0, dotfiles: 'deny' }));
  app.get('/renderer.js', (_req, res) => res.sendFile(web.layout === 'studio' ? join(web.directory, 'renderer.js') : join(runtimeRoot, 'web', 'renderer.js')));
  app.use(express.static(web.directory, { etag: false, maxAge: 0 }));
  return app;
}

export async function listenPreview(output: string, port: number): Promise<Server> {
  const server = createServer(createPreviewApp(output));
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => { server.off('error', reject); done(); });
  });
  return server;
}

async function available(port: number): Promise<boolean> {
  const probe = createProbe();
  return new Promise((done) => {
    probe.once('error', () => done(false));
    probe.listen(port, '127.0.0.1', () => probe.close(() => done(true)));
  });
}

/** Start once and reuse only a viewer serving the same output directory. */
export async function startPreview(outputDirectory: string, preferredPort = 3100) {
  if (!Number.isInteger(preferredPort) || preferredPort < 1024 || preferredPort > 65535) throw new Error('预览端口必须在 1024–65535 之间');
  const output = resolve(outputDirectory);
  const expectedWeb = resolve(previewAssets(runtimeRoot).directory).slice(runtimeRoot.length + 1);
  await mkdir(output, { recursive: true });
  for (let port = preferredPort; port < preferredPort + 10; port++) {
    if (port < 1024 || port > 65535) throw new Error('预览端口必须在 1024–65535 之间');
    const url = `http://127.0.0.1:${port}`;
    try {
      const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(700) }).then((response) => response.json()) as { service?: string; output?: string; web?: string; protocol?: number };
      if (health.service === service && health.output === output && health.web === expectedWeb && health.protocol === protocol) return { url, port, reused: true };
    } catch { /* A fresh port has no HTTP server yet. */ }
    if (!(await available(port))) continue;
    const bundled = join(runtimeRoot, 'runtime', 'preview-server.mjs');
    const isBundled = await access(bundled).then(() => true, () => false);
    const entry = isBundled ? [bundled] : [join(runtimeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(runtimeRoot, 'agent', 'preview-server.ts')];
    const logfile = join(tmpdir(), `spine-animation-preview-${port}.log`);
    const log = await open(logfile, 'a');
    const child = spawn(process.execPath, [...entry, '--output', output, '--port', String(port)], {
      detached: true, stdio: ['ignore', log.fd, log.fd], cwd: runtimeRoot
    });
    await new Promise<void>((done, reject) => { child.once('spawn', done); child.once('error', reject); });
    child.unref(); await log.close();
    for (let attempt = 0; attempt < 40; attempt++) {
      await new Promise((done) => setTimeout(done, 100));
      try {
        const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) }).then((response) => response.json()) as { service?: string; output?: string; web?: string; protocol?: number };
        if (health.service === service && health.output === output && health.web === expectedWeb && health.protocol === protocol) return { url, port, reused: false, pid: child.pid, logfile };
      } catch { /* Wait for this child to start, bounded to four seconds. */ }
    }
    throw new Error(`预览服务启动失败，请查看 ${logfile}`);
  }
  throw new Error('连续 10 个预览端口都被占用，请指定 --port');
}
