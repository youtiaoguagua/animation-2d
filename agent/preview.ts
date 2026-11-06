import express from 'express';
import { access, mkdir, open, readFile, readdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { createServer as createProbe } from 'node:net';
import { spawn } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { Manifest } from './types.js';

export const runtimeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const service = 'spine-animation-preview';

export async function listProjects(output: string): Promise<Manifest[]> {
  const projects = await readdir(output, { withFileTypes: true }).catch(() => []);
  const results = await Promise.all(projects.filter((entry) => entry.isDirectory()).map(async (project) => {
    const directory = join(output, project.name);
    const sources = await readdir(directory, { withFileTypes: true }).catch(() => []);
    return Promise.all(sources.filter((entry) => entry.isDirectory() && entry.name.endsWith('_temp')).map(async (source) => {
      try {
        const item = JSON.parse(await readFile(join(directory, source.name, 'manifest.json'), 'utf8')) as Manifest;
        if (item.version !== 1 || item.id !== `${project.name}/${source.name.slice(0, -5)}`) return null;
        return item;
      } catch { return null; }
    }));
  }));
  return results.flat().filter((item): item is Manifest => item !== null).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createPreviewApp(outputDirectory: string) {
  const output = resolve(outputDirectory), app = express();
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service, output }));
  app.get('/api/projects', async (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ projects: await listProjects(output) });
  });
  app.get('/api/project', async (req, res) => {
    const id = typeof req.query.id === 'string' ? req.query.id : '';
    const manifest = (await listProjects(output)).find((project) => project.id === id);
    if (!manifest) return res.status(404).json({ error: '没有找到这个动画项目' });
    const file = resolve(output, manifest.previewFile);
    if (!file.startsWith(output + sep)) return res.status(400).json({ error: '预览路径无效' });
    try {
      const preview = JSON.parse(await readFile(file, 'utf8'));
      return res.set('Cache-Control', 'no-store').json({ manifest, preview });
    } catch { return res.status(409).json({ error: '预览数据尚未完成，请稍后刷新' }); }
  });
  app.use('/output', express.static(output, { etag: false, maxAge: 0, dotfiles: 'deny' }));
  app.get('/renderer.js', (_req, res) => res.sendFile(join(runtimeRoot, 'web', 'renderer.js')));
  app.use(express.static(join(runtimeRoot, 'web', 'agent'), { etag: false, maxAge: 0 }));
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
  await mkdir(output, { recursive: true });
  for (let port = preferredPort; port < preferredPort + 10; port++) {
    if (port < 1024 || port > 65535) throw new Error('预览端口必须在 1024–65535 之间');
    const url = `http://127.0.0.1:${port}`;
    try {
      const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(700) }).then((response) => response.json()) as { service?: string; output?: string };
      if (health.service === service && health.output === output) return { url, port, reused: true };
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
        const health = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(500) }).then((response) => response.json()) as { service?: string; output?: string };
        if (health.service === service && health.output === output) return { url, port, reused: false, pid: child.pid, logfile };
      } catch { /* Wait for this child to start, bounded to four seconds. */ }
    }
    throw new Error(`预览服务启动失败，请查看 ${logfile}`);
  }
  throw new Error('连续 10 个预览端口都被占用，请指定 --port');
}
