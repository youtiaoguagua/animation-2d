import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import { isBuiltin } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist', 'spine-animation');
const sourceSkill = join(root, 'skills', 'spine-animation');
const { values } = parseArgs({ options: { install: { type: 'boolean' }, archive: { type: 'boolean' },
  prepare: { type: 'boolean' }, target: { type: 'string' } } });
const run = async (args: string[], cwd: string, command = 'pnpm') => {
  const child = spawn(command, args, { cwd, stdio: ['ignore', process.stderr, process.stderr] });
  await new Promise<void>((done, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? done() : reject(new Error(`${command} ${args[0]} exited ${code}`)));
  });
};

try {
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  // Copy authored resources only; the source skill also ships a generated runtime.
  for (const resource of ['SKILL.md', 'agents', 'scripts', 'references']) {
    await cp(join(sourceSkill, resource), join(dist, resource), { recursive: true });
  }
  await mkdir(join(dist, 'web'), { recursive: true });
  await cp(join(root, 'web', 'agent'), join(dist, 'web', 'agent'), { recursive: true });
  await cp(join(root, 'web', 'renderer.js'), join(dist, 'web', 'renderer.js'));
  await mkdir(join(dist, 'server'), { recursive: true });
  await cp(join(root, 'server', 'sam'), join(dist, 'server', 'sam'), { recursive: true,
    filter: (path) => !path.includes('__pycache__') });
  await cp(join(root, 'requirements.txt'), join(dist, 'requirements.txt'));
  await cp(join(root, 'LICENSE'), join(dist, 'LICENSE'));
  await cp(join(root, 'NOTICE'), join(dist, 'NOTICE'));
  const result = await build({
    entryPoints: { cli: join(root, 'agent', 'cli.ts'), 'preview-server': join(root, 'agent', 'preview-server.ts') },
    outdir: join(dist, 'runtime'), outExtension: { '.js': '.mjs' },
    bundle: true, platform: 'node', target: 'node20', format: 'esm', packages: 'external', metafile: true,
    logLevel: 'warning'
  });
  const sourcePackage = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')) as { version: string; dependencies: Record<string, string> };
  const dependencies: Record<string, string> = {};
  for (const output of Object.values(result.metafile!.outputs)) for (const item of output.imports) {
    if (!item.external || isBuiltin(item.path) || item.path.startsWith('.')) continue;
    const name = item.path.startsWith('@') ? item.path.split('/').slice(0, 2).join('/') : item.path.split('/')[0];
    if (!sourcePackage.dependencies[name]) throw new Error(`Missing production dependency: ${name}`);
    dependencies[name] = sourcePackage.dependencies[name];
  }
  await writeFile(join(dist, 'package.json'), JSON.stringify({
    name: 'spine-animation-skill', version: sourcePackage.version, private: true, type: 'module', license: 'Apache-2.0',
    engines: { node: '>=20.9.0' }, dependencies,
    files: ['SKILL.md', 'agents', 'scripts', 'references', 'runtime', 'web', 'server/sam', 'requirements.txt', 'pnpm-lock.yaml', 'LICENSE', 'NOTICE']
  }, null, 2));
  await run(['--ignore-workspace', 'install', '--lockfile-only', '--prod'], dist);
  if (values.prepare) {
    // skills add copies this folder without the rest of the repository.
    for (const resource of ['runtime', 'web', 'server', 'requirements.txt', 'LICENSE', 'NOTICE', 'package.json', 'pnpm-lock.yaml']) {
      const target = join(sourceSkill, resource);
      await rm(target, { recursive: true, force: true });
      await cp(join(dist, resource), target, { recursive: true });
    }
  }
  let installed: string | undefined;
  if (values.install) {
    installed = resolve(values.target ?? join(homedir(), '.agents', 'skills', 'spine-animation'));
    if (await access(installed).then(() => true, () => false)) {
      const existing = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8').catch(() => '{}')) as { name?: string };
      if (existing.name !== 'spine-animation-skill') throw new Error(`目标已有其他内容，请选择 --target: ${installed}`);
    }
    await cp(dist, installed, { recursive: true });
    await run(['--ignore-workspace', 'install', '--prod', '--frozen-lockfile'], installed);
  }
  if (values.archive) await run(['-czf', join(dirname(dist), `spine-animation-skill-${sourcePackage.version}.tgz`),
    '-C', dirname(dist), 'spine-animation'], root, 'tar');
  process.stdout.write(JSON.stringify({ ok: true, directory: dist, installed, dependencies,
    ...(values.prepare ? { prepared: sourceSkill } : {}),
    ...(values.archive ? { archive: join(dirname(dist), `spine-animation-skill-${sourcePackage.version}.tgz`) } : {}) }, null, 2) + '\n');
} catch (error) {
  process.stderr.write((error instanceof Error ? error.stack : String(error)) + '\n');
  process.exitCode = 1;
}
