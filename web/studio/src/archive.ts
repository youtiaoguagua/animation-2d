import { strToU8, zip } from 'fflate';
import type { AsyncZippable } from 'fflate';
import type { ExportFile, Manifest } from './types.js';

interface ArchiveOptions {
  baseUrl?: string;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

const cancelled = () => new DOMException('下载已取消', 'AbortError');
const downloadName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+|[. ]+$/g, '').trim() || 'animation';

export function resourceFilename(file: ExportFile, targetId = ''): string {
  return targetId === 'unity' && file.kind === 'atlas' && /\.atlas$/i.test(file.name)
    ? `${file.name}.txt` : file.name;
}

function compress(entries: AsyncZippable, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(cancelled()); return; }
    let settled = false;
    let terminate: (() => void) | undefined;
    const abort = () => {
      if (settled) return;
      settled = true; terminate?.(); reject(cancelled());
    };
    signal?.addEventListener('abort', abort, { once: true });
    terminate = zip(entries, { level: 6 }, (error, bytes) => {
      if (settled) return;
      settled = true; signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(new Uint8Array(bytes));
    });
    if (signal?.aborted) abort();
  });
}

/** Collect the selected export's actual files; never return an incomplete ZIP. */
export async function buildResourceArchive(manifest: Manifest, options: ArchiveOptions = {}) {
  const { signal, fetcher = globalThis.fetch } = options;
  if (signal?.aborted) throw cancelled();
  const base = new URL(options.baseUrl || globalThis.location?.href || 'http://localhost/');
  const files = manifest.files.filter((file) => ['json', 'atlas', 'texture'].includes(file.kind));
  for (const [kind, label] of [['json', '骨架 JSON'], ['atlas', '图集 ATLAS'], ['texture', '贴图 PNG']]) {
    if (!files.some((file) => file.kind === kind)) throw new Error(`缺少${label}，请重新导出后再下载。`);
  }
  const names = new Set(['readme.txt']);
  const sources = files.map((file) => {
    if (!file.name || /[\\/\u0000-\u001f]/.test(file.name) || ['.', '..'].includes(file.name)) {
      throw new Error('导出文件名无效，请重新导出后再下载。');
    }
    const entryName = resourceFilename(file, manifest.target.id);
    const name = entryName.toLowerCase();
    if (names.has(name)) throw new Error(`导出文件名重复：${entryName}`);
    names.add(name);
    const url = new URL(file.url, base);
    if (url.origin !== base.origin || !url.pathname.startsWith('/output/')) throw new Error(`导出文件地址无效：${file.name}`);
    return { file, url, entryName };
  });
  const folder = downloadName(manifest.name);
  const entries: AsyncZippable = Object.create(null);
  await Promise.all(sources.map(async ({ file, url, entryName }) => {
    let response: Response;
    try { response = await fetcher(url, { cache: 'no-store', signal }); }
    catch { if (signal?.aborted) throw cancelled(); throw new Error(`读取 ${file.name} 失败，请检查服务后重试。`); }
    if (!response.ok) throw new Error(`读取 ${file.name} 失败 (${response.status})，请刷新作品后重试。`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length) throw new Error(`${file.name} 是空文件，请重新导出后再下载。`);
    if (file.kind === 'json') {
      let version: string;
      try { version = JSON.parse(new TextDecoder().decode(bytes)).skeleton.spine; }
      catch { throw new Error('骨架 JSON 内容无效，请重新导出后再下载。'); }
      if (version !== manifest.target.spine) throw new Error('骨架版本与当前导出目标不一致，请刷新作品后重试。');
    }
    entries[`${folder}/${entryName}`] = file.kind === 'texture' ? [bytes, { level: 0 }] : bytes;
  }));
  if (signal?.aborted) throw cancelled();
  const instructions = [
    manifest.title || manifest.name,
    `作品：${manifest.project} / ${manifest.name}`,
    `导出目标：${manifest.target.label}`,
    `Spine 数据版本：${manifest.target.spine}`,
    `动画：${manifest.animations.map((animation) => `${animation.name} (${animation.duration.toFixed(2)}s)`).join('、')}`,
    '',
    '将同名的 JSON、ATLAS、PNG 文件保存在同一目录，使用与数据版本匹配的 Spine 运行库导入目标引擎。',
    ...(manifest.target.id === 'unity' ? ['Unity 图集已采用 .atlas.txt 后缀。安装匹配版本的 spine-unity 后，将此文件夹导入 Assets。',
      '官方导入说明：https://esotericsoftware.com/spine-unity-assets'] : []),
    ...(manifest.warnings.length ? ['', '构建提示：', ...manifest.warnings.map((warning) => `- ${warning}`)] : []),
    ''
  ].join('\n');
  entries[`${folder}/README.txt`] = strToU8(instructions);
  return { filename: `${folder}-${downloadName(manifest.target.id)}.zip`, data: await compress(entries, signal) };
}
