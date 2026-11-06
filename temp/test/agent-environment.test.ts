import { test } from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { supportsNode } from '../../skills/spine-animation/scripts/environment.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const execute = promisify(execFile);
const scripts = join(root, 'skills/spine-animation/scripts');
interface Report {
  ok: boolean;
  result: {
    ready: boolean;
    runtime: string;
    output: { ready: boolean; path: string } | null;
    capabilities: { mesh: boolean; sam3: boolean; preview: boolean };
    checks: { id: string; ok: boolean; required: boolean }[];
    repairs: { id: string; command?: string; args?: string[] }[];
  };
}

async function fixture(t: { after: (fn: () => unknown) => void }, dependencies = false) {
  const dir = await mkdtemp(join(tmpdir(), 'spine env check '));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(scripts, join(dir, 'scripts'), { recursive: true });
  await mkdir(join(dir, 'runtime'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'spine-animation-skill', type: 'module',
    dependencies: { sharp: '^0.35.4', express: '^4.18.2' } }));
  const marker = join(dir, 'runtime-was-loaded');
  await writeFile(join(dir, 'runtime/cli.mjs'), `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'loaded');throw new Error('Doctor must not load the application');`);
  if (dependencies) {
    await mkdir(join(dir, 'node_modules'), { recursive: true });
    for (const name of ['sharp', 'express']) await symlink(join(root, 'node_modules', name), join(dir, 'node_modules', name), 'dir');
  }
  return { dir, marker };
}

async function doctor(dir: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env) {
  try {
    const value = await execute(process.execPath, [join(dir, 'scripts/spine.mjs'), 'doctor', ...args], { cwd: dir, env, maxBuffer: 1024 * 1024 });
    return { code: 0, data: JSON.parse(value.stdout) as Report, stderr: value.stderr };
  } catch (error) {
    const failure = error as Error & { code: number; stdout: string; stderr: string };
    return { code: failure.code, data: JSON.parse(failure.stdout) as Report, stderr: failure.stderr };
  }
}

test('Node 最低版本边界与更高版本可正确识别', () => {
  for (const version of ['v18.20.0', '20.8.9', 'not-a-version']) assert.equal(supportsNode(version), false);
  for (const version of ['20.9.0', 'v20.19.0', '22.0.0', '24.19.0']) assert.equal(supportsNode(version), true);
});

test('没有应用依赖时，doctor 仍输出完整 JSON 和正确目录的修复命令', async (t) => {
  const { dir, marker } = await fixture(t);
  const { code, data, stderr } = await doctor(dir, ['--segmentation', 'mesh']);
  assert.equal(code, 1); assert.equal(data.ok, false);
  assert.ok(data.result.checks.some((check) => check.id === 'sharp' && check.required && !check.ok));
  assert.ok(data.result.checks.some((check) => check.id === 'express' && check.required && !check.ok));
  const repair = data.result.repairs.find((item) => item.id === 'install-dependencies')!;
  assert.equal(repair.command, 'pnpm');
  assert.equal(await realpath(repair.args![repair.args!.indexOf('--dir') + 1]), await realpath(dir));
  assert.ok(repair.args?.includes('--prod'));
  assert.equal(data.result.repairs.filter((item) => item.id === 'install-dependencies').length, 1);
  assert.equal(stderr, '');
  await assert.rejects(access(marker));
});

test('可选 SAM 缺失不阻塞整图，输出探测文件会清理', async (t) => {
  const { dir, marker } = await fixture(t, true);
  const output = join(dir, 'chosen output');
  const { code, data } = await doctor(dir, ['--segmentation', 'mesh', '--output', output]);
  assert.equal(code, 0); assert.equal(data.result.ready, true);
  assert.equal(data.result.capabilities.mesh, true); assert.equal(data.result.capabilities.sam3, false);
  assert.ok(data.result.checks.filter((item) => ['mobilesam', 'sam3', 'spine-editor'].includes(item.id)).every((item) => !item.required));
  assert.deepEqual(data.result.repairs, []);
  assert.deepEqual(await readdir(output), []);
  await assert.rejects(access(marker));
});

test('依赖已安装时缺少 pnpm 不影响运行，缺依赖时会报告安装工具缺失', async (t) => {
  const healthy = await fixture(t, true);
  const ready = await doctor(healthy.dir, ['--segmentation', 'polygon'], { ...process.env, PATH: '' });
  assert.equal(ready.code, 0);
  assert.ok(ready.data.result.checks.some((item) => item.id === 'pnpm' && !item.ok && !item.required));
  const missing = await fixture(t);
  const blocked = await doctor(missing.dir, ['--segmentation', 'mesh'], { ...process.env, PATH: '' });
  assert.equal(blocked.code, 1);
  assert.ok(blocked.data.result.checks.some((item) => item.id === 'pnpm' && !item.ok && item.required));
  assert.equal(blocked.data.result.repairs[0].id, 'prepare-pnpm');
});

test('明确请求缺失 SAM 3 时自检失败并给出安装入口', async (t) => {
  const { dir } = await fixture(t, true);
  await mkdir(join(dir, 'server'), { recursive: true });
  await cp(join(root, 'server/sam'), join(dir, 'server/sam'), { recursive: true });
  const { code, data } = await doctor(dir, ['--segmentation', 'sam3'], { ...process.env, SPINE_SAM3_HOME: join(dir, 'missing sam3') });
  assert.equal(code, 1);
  assert.ok(data.result.checks.some((item) => item.id === 'sam3' && item.required && !item.ok));
  const repair = data.result.repairs.find((item) => item.id === 'setup-sam3')!;
  assert.equal(repair.command, process.execPath);
  assert.deepEqual(repair.args?.slice(-3), ['sam-setup', '--segmentation', 'sam3']);
});

test('输出路径不是目录时不覆盖现有文件', async (t) => {
  const { dir } = await fixture(t, true);
  const output = join(dir, 'existing file'); await writeFile(output, 'keep me');
  const { code, data } = await doctor(dir, ['--segmentation', 'mesh', '--output', output]);
  assert.equal(code, 1);
  assert.ok(data.result.checks.some((item) => item.id === 'output' && item.required && !item.ok));
  assert.equal(await readFile(output, 'utf8'), 'keep me');
});

test('预览资源只在任务请求预览时成为必需项', async (t) => {
  const { dir } = await fixture(t, true);
  const missing = await doctor(dir, ['--segmentation', 'mesh', '--preview']);
  assert.equal(missing.code, 1);
  assert.ok(missing.data.result.checks.some((item) => item.id === 'preview' && item.required && !item.ok));
  await mkdir(join(dir, 'web/agent'), { recursive: true });
  for (const name of ['index.html', 'app.js', 'style.css']) await writeFile(join(dir, 'web/agent', name), '');
  await writeFile(join(dir, 'web/renderer.js'), ''); await writeFile(join(dir, 'runtime/preview-server.mjs'), '');
  const ready = await doctor(dir, ['--segmentation', 'mesh', '--preview']);
  assert.equal(ready.code, 0); assert.equal(ready.data.result.capabilities.preview, true);
});

test('可编辑工程请求会检查指定编辑器路径，不替换用户指定版本', async (t) => {
  const { dir } = await fixture(t, true);
  const { code, data } = await doctor(dir, ['--segmentation', 'mesh', '--editable', '--spine-cli', join(dir, 'missing editor')]);
  assert.equal(code, 1);
  assert.ok(data.result.checks.some((item) => item.id === 'spine-editor' && item.required && !item.ok));
  assert.ok(data.result.repairs.some((item) => item.id === 'configure-spine'));
});

test('损坏安装包不会误用源码回退或建议向无关父目录安装', async (t) => {
  const { dir } = await fixture(t);
  await rm(join(dir, 'runtime/cli.mjs'));
  await rm(join(dir, 'package.json'));
  const { code, data } = await doctor(dir, ['--segmentation', 'mesh']);
  assert.equal(code, 1);
  assert.ok(data.result.repairs.some((item) => item.id === 'restore-runtime'));
  assert.ok(!data.result.repairs.some((item) => item.id === 'install-dependencies'));
});
