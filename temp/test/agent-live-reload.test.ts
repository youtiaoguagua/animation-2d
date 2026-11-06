import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listenPreview } from '../../agent/preview.js';
import { reconcileProjects } from '../../web/studio/src/project-updates.js';

test('预览版本稳定，并检测仅预览 JSON、贴图和引擎资源的更改', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'spine-live-reload-'));
  const directory = join(output, 'live', 'hero_temp');
  await mkdir(directory, { recursive: true });
  const manifest = { version: 1, id: 'live/hero', createdAt: '2026-11-06T00:00:00Z',
    previewFile: 'live/hero_temp/preview.json', sourceUrl: '/output/live/hero_temp/source.png',
    files: [{ kind: 'json', name: 'hero.json', url: '/output/live/hero_temp/hero.json' }] };
  const preview = { sourceUrl: manifest.sourceUrl, imageUrls: [['body', '/output/live/hero_temp/body.png']], skeleton: {} };
  await Promise.all([
    writeFile(join(directory, 'manifest.json'), JSON.stringify(manifest)),
    writeFile(join(directory, 'preview.json'), JSON.stringify(preview)),
    writeFile(join(directory, 'source.png'), 'original'), writeFile(join(directory, 'body.png'), 'texture'),
    writeFile(join(directory, 'hero.json'), '{}')
  ]);
  const server = await listenPreview(output, 0);
  t.after(async () => { await new Promise<void>((resolve) => server.close(() => resolve())); await rm(output, { recursive: true, force: true }); });
  const address = server.address() as { port: number }, base = `http://127.0.0.1:${address.port}`;
  const project = async () => (await (await fetch(`${base}/api/projects`)).json()).projects[0] as { revision: string; createdAt: string };
  const initial = await project();
  assert.match(initial.revision, /^[a-f0-9]{24}$/);
  assert.equal((await project()).revision, initial.revision);
  let previous = initial.revision;
  for (const [file, text] of [
    ['preview.json', JSON.stringify({ ...preview, marker: 'new motion' })],
    ['body.png', 'new texture'], ['source.png', 'new source'], ['hero.json', '{"updated":true}']
  ]) {
    await writeFile(join(directory, file), text);
    const next = await project();
    assert.notEqual(next.revision, previous, `${file} 修改后版本必须更新`);
    assert.equal(next.createdAt, initial.createdAt);
    assert.equal((await project()).revision, next.revision); previous = next.revision;
  }
  const detail = await (await fetch(`${base}/api/project?id=live%2Fhero`)).json();
  assert.equal(detail.manifest.revision, previous);
  await rm(join(directory, 'body.png'));
  assert.notEqual((await project()).revision, previous, '删除贴图也应触发重载');
  assert.equal((await (await fetch(`${base}/api/health`)).json()).protocol, 2);
});

test('自动同步仅重载当前变更的作品，首次生成、等待项目和手动选择均可衔接', () => {
  const first = { id: 'first/hero', revision: 'a' }, second = { id: 'second/hero', revision: 'b' };
  assert.equal(reconcileProjects([], [first], null, null, false).activeId, first.id);
  assert.equal(reconcileProjects([first], [first], first.id, null, false).reload, false);
  const unrelated = reconcileProjects([first], [second, first], first.id, null, false);
  assert.equal(unrelated.activeId, first.id); assert.equal(unrelated.reload, false); assert.equal(unrelated.projectsChanged, true);
  assert.equal(reconcileProjects([first], [{ ...first, revision: 'new' }], first.id, null, false).reload, true);
  const waiting = reconcileProjects([], [first], null, second.id, false);
  assert.equal(waiting.activeId, null); assert.equal(waiting.waitingFor, second.id);
  assert.equal(reconcileProjects([first], [second, first], null, second.id, false).activeId, second.id);
  assert.equal(reconcileProjects([first], [second, first], first.id, second.id, true).activeId, first.id);
  assert.equal(reconcileProjects([first], [], first.id, null, false).activeId, null);
});
