// Bootstrap checks use Node built-ins so missing Sharp/Express cannot hide the
// diagnostic. This module does not install packages or download model weights.
import { existsSync, readFileSync, constants } from 'node:fs';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';

const execute = promisify(execFile);
export const minimumNode = '20.9.0';
const readPackage = (file) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; } };
const detailOf = (error) => String(error?.stderr?.trim().split('\n').at(-1) || error?.message || error).slice(0, 500);

export function supportsNode(version, minimum = minimumNode) {
  const actual = String(version).replace(/^v/, '').split('.').map((part) => parseInt(part, 10));
  const required = minimum.split('.').map(Number);
  if (actual.length < 3 || actual.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i++) if (actual[i] !== required[i]) return actual[i] > required[i];
  return true;
}

export function resolveRuntime(directory) {
  const skill = resolve(directory);
  const bundled = readPackage(join(skill, 'package.json'))?.name === 'spine-animation-skill' || existsSync(join(skill, 'runtime'));
  const packageRoot = bundled ? skill : resolve(skill, '../..');
  const manifest = readPackage(join(packageRoot, 'package.json'));
  const canInstall = !!manifest?.dependencies?.sharp && !!manifest?.dependencies?.express;
  const entry = bundled ? [join(skill, 'runtime', 'cli.mjs')]
    : [join(packageRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(packageRoot, 'agent', 'cli.ts')];
  return { skill, packageRoot, kind: bundled ? 'bundle' : 'source', entry, canInstall,
    ready: canInstall && entry.every(existsSync) };
}

function packageVersion(entry, name) {
  for (let dir = dirname(entry), count = 0; count < 8; dir = dirname(dir), count++) {
    const manifest = readPackage(join(dir, 'package.json'));
    if (manifest?.name === name) return manifest.version;
    if (dir === dirname(dir)) break;
  }
  return null;
}

async function checkDependency(require, name, nodeReady) {
  let entry;
  try { entry = require.resolve(name); }
  catch { return { available: false, ready: false, error: `${name} 未安装` }; }
  const version = packageVersion(entry, name);
  if (!nodeReady) return { available: true, ready: false, version, error: '需要先升级 Node.js 才能验证依赖' };
  try {
    const module = require(name);
    if (name === 'sharp') await module({ create: { width: 1, height: 1, channels: 4, background: '#00000000' } }).png().toBuffer();
    if (name === 'express' && typeof module().use !== 'function') throw new Error('Express 初始化失败');
    return { available: true, ready: true, version };
  } catch (error) { return { available: true, ready: false, version, error: detailOf(error) }; }
}

async function checkPnpm() {
  try {
    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'pnpm';
    const args = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm --version'] : ['--version'];
    const { stdout } = await execute(command, args, { timeout: 5000, windowsHide: true });
    const version = stdout.split('\n').map((line) => line.trim()).find((line) => /^\d+\.\d+\.\d+/.test(line));
    return { available: !!version, version: version ?? null };
  } catch (error) { return { available: false, version: null, error: detailOf(error) }; }
}

async function checkSam(packageRoot, backend, verify) {
  const directory = join(packageRoot, 'server', 'sam');
  const resources = backend === 'mobilesam' ? ['client.mjs', 'setup.mjs', 'worker.py']
    : ['client-sam3.mjs', 'setup-sam3.mjs', 'worker_sam3.py'];
  if (resources.some((file) => !existsSync(join(directory, file)))) {
    return { available: false, filesReady: false, resourcesReady: false, verified: false, error: 'skill 的可选 SAM 资源文件不完整' };
  }
  try {
    const module = await import(pathToFileURL(join(directory, backend === 'mobilesam' ? 'client.mjs' : 'client-sam3.mjs')).href);
    const paths = backend === 'mobilesam' ? module.paths() : module.sam3Paths();
    const client = backend === 'mobilesam' ? new module.SamClient() : new module.Sam3Client();
    const worker = backend === 'mobilesam' ? join(directory, 'worker.py') : paths.worker;
    const weightBytes = await stat(paths.weights).then((file) => file.size, () => 0);
    const filesReady = client.checkEnv() && existsSync(worker) && weightBytes > 0;
    const status = { available: filesReady, filesReady, resourcesReady: true, verified: false, home: paths.home,
      python: paths.python, weightBytes };
    if (!verify || !filesReady) return status;
    const imports = backend === 'mobilesam'
      ? 'import numpy, PIL, cv2, timm; sys.path.insert(0, sys.argv[1]); import mobile_sam'
      : 'from transformers import Sam3Model, Sam3Processor';
    const script = `import sys, json, torch\n${imports}\nprint(json.dumps({"python": sys.version.split()[0], "torch": torch.__version__, "device": "mps" if torch.backends.mps.is_available() else "cuda" if torch.cuda.is_available() else "cpu"}))`;
    try {
      const { stdout } = await execute(paths.python, ['-c', script, paths.repo ?? paths.home], {
        timeout: 20000, maxBuffer: 1024 * 1024, env: { ...process.env, PYTHONWARNINGS: 'ignore' }, windowsHide: true
      });
      const info = JSON.parse(stdout.trim().split('\n').at(-1));
      return { ...status, available: true, verified: true, versions: info, verification: 'files-and-python-imports' };
    } catch (error) { return { ...status, available: false, error: detailOf(error) }; }
  } catch (error) { return { available: false, filesReady: false, resourcesReady: false, verified: false, error: detailOf(error) }; }
}

async function checkOutput(directory) {
  const path = resolve(directory);
  let probe;
  try {
    await mkdir(path, { recursive: true });
    probe = await mkdtemp(join(path, '.spine-preflight-'));
    await writeFile(join(probe, 'write-check'), 'ok');
    return { ready: true, path };
  } catch (error) { return { ready: false, path, error: detailOf(error) }; }
  finally { if (probe) await rm(probe, { recursive: true, force: true }); }
}

async function checkEditor(explicit) {
  const selected = explicit || process.env.SPINE_CLI_PATH;
  const candidates = selected ? [selected] : [
    '/Applications/Spine.app/Contents/MacOS/Spine', join(homedir(), 'Applications/Spine.app/Contents/MacOS/Spine'),
    '/opt/spine/Spine', '/usr/local/bin/Spine', 'C:\\Program Files\\Spine\\Spine.com'
  ];
  for (const path of candidates) {
    try { await access(path, constants.X_OK); return { available: true, path, licenseVerified: false }; }
    catch { /* Check the next default, never replace an explicit selection. */ }
  }
  return { available: false, path: selected || null, licenseVerified: false };
}

export async function checkEnvironment({ skillDirectory, output, segmentation = 'auto', preview = false,
  editable = false, spineCliPath } = {}) {
  if (!skillDirectory) throw new Error('缺少 skillDirectory');
  if (!['auto', 'mesh', 'polygon', 'mobilesam', 'sam3'].includes(segmentation)) throw new Error('未知 segmentation');
  const layout = resolveRuntime(skillDirectory);
  const require = createRequire(join(layout.packageRoot, 'package.json'));
  const nodeReady = supportsNode(process.versions.node);
  const checks = [];
  const add = (id, ok, required, detail, repair) => checks.push({ id, ok, required, detail, ...(repair && !ok ? { repair } : {}) });
  const installArgs = ['--dir', layout.packageRoot, ...(layout.kind === 'bundle' ? ['--ignore-workspace'] : []),
    'install', ...(layout.kind === 'bundle' ? ['--prod'] : []),
    ...(existsSync(join(layout.packageRoot, 'pnpm-lock.yaml')) ? ['--frozen-lockfile'] : [])];
  const restoreRuntime = { id: 'restore-runtime', message: '重新解压完整 skill 安装包；源码开发目录可运行 pnpm skill:build' };
  const install = layout.canInstall ? { id: 'install-dependencies', command: 'pnpm', args: installArgs,
    message: `安装 ${layout.kind === 'bundle' ? 'skill 生产依赖' : '源码项目依赖'}后重新运行自检` } : restoreRuntime;
  add('node', nodeReady, true, `Node ${process.version}; 需要 >=${minimumNode}`,
    { id: 'upgrade-node', message: `使用当前环境的版本管理器或包管理器准备 Node.js >=${minimumNode}，然后重跑自检` });
  const sourceMissingTsx = layout.kind === 'source' && !existsSync(layout.entry[0]) && existsSync(layout.entry[1]);
  add('runtime', layout.ready, true, layout.ready ? `${layout.kind}: ${layout.entry.at(-1)}` : '缺少运行入口或源码执行器',
    sourceMissingTsx ? install : restoreRuntime);
  const dependencies = {};
  for (const name of ['sharp', 'express']) {
    const state = await checkDependency(require, name, nodeReady);
    dependencies[name] = state;
    add(name, state.ready, true, state.ready ? `${name} ${state.version}` : state.error,
      state.available && !nodeReady ? undefined : install);
  }
  const needInstall = layout.canInstall && (sourceMissingTsx || Object.values(dependencies).some((item) => !item.ready && (nodeReady || !item.available)));
  const pnpm = await checkPnpm();
  add('pnpm', pnpm.available, needInstall, pnpm.available ? `pnpm ${pnpm.version}` : '未找到可用 pnpm；已安装依赖时不会阻止运行',
    { id: 'prepare-pnpm', message: '使用当前环境已有的工具准备 pnpm，再执行依赖安装；不要修改其他项目的依赖' });
  const [mobilesam, sam3] = await Promise.all([
    checkSam(layout.packageRoot, 'mobilesam', segmentation === 'mobilesam'),
    checkSam(layout.packageRoot, 'sam3', segmentation === 'sam3')
  ]);
  const sam = { mobilesam, sam3 };
  for (const [name, state] of Object.entries(sam)) {
    add(name, state.available, segmentation === name,
      state.verified ? `${name} 的 Python 依赖已验证（${state.versions.device}），权重尚未加载推理`
        : state.available ? `${name} 资源文件存在；本次未加载 Python 检查` : `${name} 不可用${state.error ? `: ${state.error}` : '（缺少环境或模型文件）'}`,
      state.resourcesReady === false ? { id: `restore-${name}`, message: `从完整 skill 包恢复 server/sam 中的 ${name} 脚本` }
        : { id: `setup-${name}`, command: process.execPath, args: [join(layout.skill, 'scripts', 'spine.mjs'), 'sam-setup', '--segmentation', name],
          message: `仅在当前任务需要 ${name} 时安装其 Python 环境和模型，然后复检` });
  }
  const previewFiles = ['web/agent/index.html', 'web/agent/app.js', 'web/agent/style.css', 'web/renderer.js',
    layout.kind === 'bundle' ? 'runtime/preview-server.mjs' : 'agent/preview-server.ts'];
  const missingPreview = previewFiles.filter((file) => !existsSync(join(layout.packageRoot, file)));
  add('preview', missingPreview.length === 0, preview, missingPreview.length ? `缺少预览资源: ${missingPreview.join(', ')}` : '预览服务与页面资源存在；浏览器能力由 agent 宿主检查',
    { id: 'restore-preview', message: '恢复完整 skill 包中的 web 和预览服务文件，再重新自检' });
  const editor = await checkEditor(spineCliPath);
  add('spine-editor', editor.available, editable || !!spineCliPath,
    editor.available ? `检测到 ${editor.path}，未检查许可证状态` : '没有找到 Spine 编辑器（普通 JSON/atlas/PNG 导出不需要）',
    { id: 'configure-spine', message: '可编辑 .spine 需要已授权的 Spine 编辑器；提供有效 --spine-cli 路径或 SPINE_CLI_PATH' });
  const outputState = output ? await checkOutput(output) : null;
  if (outputState) add('output', outputState.ready, true, outputState.ready ? `可写: ${outputState.path}` : outputState.error,
    { id: 'fix-output', message: `修复输出目录的可写性或确认正确目录: ${outputState.path}` });
  const priority = { 'upgrade-node': 0, 'prepare-pnpm': 1, 'restore-runtime': 2, 'install-dependencies': 3 };
  const repairs = [...new Map(checks.filter((item) => item.required && !item.ok && item.repair).map((item) => [item.repair.id, item.repair])).values()]
    .sort((a, b) => (priority[a.id] ?? 10) - (priority[b.id] ?? 10));
  const baseReady = checks.filter((item) => ['node', 'runtime', 'sharp', 'express'].includes(item.id)).every((item) => item.ok);
  return {
    ready: checks.every((item) => !item.required || item.ok), node: process.version, requiredNode: `>=${minimumNode}`,
    sharp: dependencies.sharp.version ?? null, runtime: layout.packageRoot, runtimeMode: layout.kind,
    modelApiRequired: false, segmentation, dependencies, pnpm, sam, editor, output: outputState,
    capabilities: { mesh: baseReady, polygon: baseReady, mobilesam: baseReady && mobilesam.available,
      sam3: baseReady && sam3.available, preview: baseReady && !missingPreview.length, editable: baseReady && editor.available },
    checks, repairs
  };
}

export async function runDoctor(argv, skillDirectory) {
  const { values } = parseArgs({ args: argv, options: {
    output: { type: 'string' }, segmentation: { type: 'string', default: 'auto' }, preview: { type: 'boolean' },
    editable: { type: 'boolean' }, 'spine-cli': { type: 'string' }, help: { type: 'boolean', short: 'h' }
  } });
  if (values.help) return { ok: true, result: { command: 'doctor',
    options: ['--output DIR', '--segmentation auto|mesh|polygon|mobilesam|sam3', '--preview', '--editable', '--spine-cli PATH'] } };
  const result = await checkEnvironment({ skillDirectory, output: values.output, segmentation: values.segmentation,
    preview: values.preview, editable: values.editable, spineCliPath: values['spine-cli'] });
  return { ok: result.ready, result, ...(!result.ready ? { error: '当前任务所需环境尚未就绪，请按 repairs 修复后重新检查' } : {}) };
}
