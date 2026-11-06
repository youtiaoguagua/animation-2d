import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { Part } from './types.js';

export type SegmentationMode = 'auto' | 'polygon' | 'mobilesam' | 'sam3' | 'mesh';
export interface SegmentationReport {
  requested: SegmentationMode;
  backend: 'polygon' | 'mobilesam' | 'sam3' | 'mesh';
  samParts: string[];
  polygonParts: string[];
  elapsedMs: number;
  maskBackends?: Record<string, string>;
  note?: string;
}
const samRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../server/sam');
const load = (name: string) => import(pathToFileURL(join(samRoot, name)).href);

export async function samStatus() {
  const [mobile, sam3] = await Promise.all([load('client.mjs'), load('client-sam3.mjs')]);
  const mobilePaths = mobile.paths(), sam3Paths = sam3.sam3Paths();
  const size = (path: string) => stat(path).then((file) => file.size, () => 0);
  return {
    mobilesam: { available: new mobile.SamClient().checkEnv(), home: mobilePaths.home, weightBytes: await size(mobilePaths.weights) },
    sam3: { available: new sam3.Sam3Client().checkEnv(), home: sam3Paths.home, weightBytes: await size(sam3Paths.weights) }
  };
}

export function chooseSegmentation(mode: SegmentationMode, status: { mobilesam: { available: boolean }; sam3: { available: boolean } }) {
  if (!['auto', 'polygon', 'mobilesam', 'sam3', 'mesh'].includes(mode)) throw new Error('segmentation 必须是 auto、polygon、mobilesam、sam3 或 mesh');
  if (mode === 'polygon' || mode === 'mesh') return mode;
  if (mode !== 'auto') {
    if (!status[mode].available) throw new Error(`${mode} 未安装；请运行 sam-setup --segmentation ${mode}`);
    return mode;
  }
  return status.mobilesam.available ? 'mobilesam' : status.sam3.available ? 'sam3' : 'polygon';
}

export async function segmentationBackend(mode: SegmentationMode) {
  if (mode === 'polygon' || mode === 'mesh') return mode;
  return chooseSegmentation(mode, await samStatus());
}

export async function segment(image: string, parts: Part[], requested: SegmentationMode,
  backend: 'polygon' | 'mobilesam' | 'sam3' | 'mesh', onLog: (message: string) => void) {
  const report: SegmentationReport = { requested, backend, samParts: [], polygonParts: [], elapsedMs: 0 };
  if (backend === 'polygon' || backend === 'mesh') {
    if (backend === 'polygon') report.polygonParts = parts.map((part) => part.name);
    if (requested === 'auto' && backend === 'polygon') report.note = '未安装本地 SAM，使用多边形轮廓';
    return { masks: null, report };
  }
  const [segmentation, mobile, sam3] = await Promise.all([load('segment.mjs'), load('client.mjs'), load('client-sam3.mjs')]);
  const started = performance.now();
  try {
    const masks = await segmentation.segmentParts(image, parts, { useSam: true, segmenter: backend, requireEnv: true,
      onLog: (message: string) => onLog(message) }) as Map<string, unknown> | null;
    if (!masks?.size) throw new Error(`${backend} 未得到可用掩码`);
    report.samParts = parts.filter((part) => masks.has(part.name)).map((part) => part.name);
    report.maskBackends = Object.fromEntries([...masks].map(([name, mask]) => [name, (mask as { via?: string }).via ?? backend]));
    report.polygonParts = parts.filter((part) => !masks.has(part.name)).map((part) => part.name);
    report.elapsedMs = Math.round(performance.now() - started);
    if (report.polygonParts.length) report.note = `${report.polygonParts.length} 个部件使用多边形回退`;
    return { masks, report };
  } catch (error) {
    if (requested !== 'auto') throw error;
    report.backend = 'polygon'; report.polygonParts = parts.map((part) => part.name);
    report.elapsedMs = Math.round(performance.now() - started);
    report.note = `${backend} 运行失败，使用多边形：${error instanceof Error ? error.message : String(error)}`;
    return { masks: null, report };
  } finally {
    mobile.stopSamClient(); sam3.stopSam3Client();
  }
}

export async function setupSam(backend: string) {
  if (!['mobilesam', 'sam3'].includes(backend)) throw new Error('sam-setup 需要 --segmentation mobilesam 或 sam3');
  const entry = join(samRoot, backend === 'mobilesam' ? 'setup.mjs' : 'setup-sam3.mjs');
  const child = spawn(process.execPath, [entry], { stdio: ['ignore', process.stderr, process.stderr] });
  await new Promise<void>((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? done() : reject(new Error(`${backend} 安装失败 (${code})`)));
  });
  const status = await samStatus();
  if (!status[backend as 'mobilesam' | 'sam3'].available) throw new Error(`${backend} 安装完成后环境仍不完整，请检查安装日志`);
  return status;
}
