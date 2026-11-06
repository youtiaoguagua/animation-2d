#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const skill = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let environment;
try { environment = await import('./environment.mjs'); }
catch {
  process.stdout.write(JSON.stringify({ ok: false, error: '自检组件缺失，请恢复完整 skill 安装包' }) + '\n');
  process.exit(1);
}
if (process.argv[2] === 'doctor') {
  try {
    const result = await environment.runDoctor(process.argv.slice(3), skill);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error) }) + '\n'); process.exitCode = 1;
  }
} else {
  const { entry, ready } = environment.resolveRuntime(skill);
  if (!environment.supportsNode(process.versions.node) || !ready) {
    process.stdout.write(JSON.stringify({ ok: false, error: 'Node 版本或运行入口不满足要求，请先运行 doctor 获取修复步骤' }) + '\n');
    process.exit(1);
  }
  if (process.argv[2] === 'prepare') {
    try {
      const { runPrepare } = await import('./image-preparation.mjs');
      process.stdout.write(JSON.stringify(await runPrepare(process.argv.slice(3), skill), null, 2) + '\n');
    } catch (error) {
      process.stdout.write(JSON.stringify({ ok: false, error: error?.message || String(error) }) + '\n'); process.exitCode = 1;
    }
  } else {
    const child = spawn(process.execPath, [...entry, ...process.argv.slice(2)], { stdio: 'inherit', cwd: process.cwd() });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
    child.once('error', (error) => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
    child.once('exit', (code) => { process.exitCode = code ?? 1; });
  }
}
