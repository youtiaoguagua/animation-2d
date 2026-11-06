import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnimation } from './engine.js';
import { startPreview } from './preview.js';
import { checkEnvironment } from '../skills/spine-animation/scripts/environment.mjs';

console.log = (...values: unknown[]) => console.error(...values);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'output');
try {
  const environment = await checkEnvironment({ skillDirectory: join(root, 'skills/spine-animation'),
    output, segmentation: 'mesh', preview: true });
  if (!environment.ready) throw new Error('环境未就绪，请先运行 pnpm run doctor 并按 repairs 修复');
  const assets = join(root, 'assets/demo');
  const result = await buildAnimation({ image: join(assets, 'character-original.png'),
    analysis: JSON.parse(await readFile(join(assets, 'analysis.json'), 'utf8')),
    motion: JSON.parse(await readFile(join(assets, 'motion.json'), 'utf8')),
    output, project: 'demo-idle', name: 'character', title: '角色待机 · 透明整图',
    segmentation: 'mesh', backgroundMode: 'transparent', blink: true, replace: true,
    onLog: (message) => console.error(`[demo] ${message}`) });
  const viewer = await startPreview(output);
  process.stdout.write(JSON.stringify({ ok: true, previewUrl: `${viewer.url}/?project=${encodeURIComponent(result.manifest.id)}`,
    exportDirectory: result.exportDirectory, manifest: result.manifestFile }, null, 2) + '\n');
} catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) + '\n');
  process.exitCode = 1;
}
