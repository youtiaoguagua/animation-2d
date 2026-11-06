import { parseArgs } from 'node:util';
import { resolve, basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { buildAnimation, normalizePlan, prepare, readJson, validateMotion, inspectImage } from './engine.js';
import { listProjects, startPreview, runtimeRoot } from './preview.js';
import sharp from 'sharp';
import { setupSam, type SegmentationMode } from './segmentation.js';
import { checkEnvironment } from '../skills/spine-animation/scripts/environment.mjs';

// Imported application helpers log progress. Keep stdout a single JSON result.
console.log = (...values: unknown[]) => console.error(...values);
const [command = 'help', ...argv] = process.argv.slice(2);
const help = {
  name: 'spine-animation',
  commands: {
    doctor: '[--output DIR] [--segmentation MODE] [--preview] [--editable]: check required dependencies and return repair commands before building.',
    inspect: '--image FILE: inspect actual alpha and a possible colored matte.',
    prepare: '--image FILE --workdir DIR [--prompt TEXT] [--background transparent]: normalize and inspect the planning image.',
    validate: '--image FILE --analysis FILE [--motion FILE]: validate the agent-authored plans without writing artifacts.',
    build: '--image FILE --analysis FILE --project NAME [--motion FILE] [--segmentation auto|polygon|mobilesam|sam3|mesh] [--background auto|transparent|preserve] [--matte-color #RRGGBB] [--blink] [--preview] [--replace] [--editable]',
    'sam-setup': '--segmentation mobilesam|sam3: explicitly install an optional local Python/model environment.',
    preview: '[--output DIR] [--port 3100] [--id PROJECT/ASSET]: start/reuse the persistent local demo page.',
    list: '[--output DIR]: list completed animation manifests.'
  },
  coordinates: 'analysis.units is normalized or pixels. bbox/polygon use the whole image; pivot is relative to the part bbox.'
};

async function main() {
  const { values } = parseArgs({ args: argv, options: {
    image: { type: 'string' }, workdir: { type: 'string' }, prompt: { type: 'string' },
    analysis: { type: 'string' }, motion: { type: 'string' }, project: { type: 'string' }, name: { type: 'string' },
    output: { type: 'string' }, target: { type: 'string' }, density: { type: 'string' }, port: { type: 'string', default: '3100' },
    id: { type: 'string' }, blink: { type: 'boolean' }, preview: { type: 'boolean' }, replace: { type: 'boolean' },
    'keep-background': { type: 'boolean' }, help: { type: 'boolean', short: 'h' },
    editable: { type: 'boolean' }, 'spine-cli': { type: 'string' },
    segmentation: { type: 'string', default: 'auto' }, background: { type: 'string', default: 'auto' },
    'matte-color': { type: 'string' }, title: { type: 'string' }
  } });
  const required = (key: keyof typeof values): string => {
    const value = values[key];
    if (typeof value !== 'string' || !value) throw new Error(`缺少 --${key}`);
    return value;
  };
  const output = resolve(values.output ?? 'output');
  if (values.help || ['help', '--help', '-h'].includes(command)) return help;
  if (command === 'doctor') {
    const result = await checkEnvironment({
      skillDirectory: existsSync(join(runtimeRoot, 'SKILL.md')) ? runtimeRoot : join(runtimeRoot, 'skills', 'spine-animation'),
      output: values.output, segmentation: values.segmentation, preview: values.preview,
      editable: values.editable, spineCliPath: values['spine-cli']
    });
    if (!result.ready) process.exitCode = 1;
    return result;
  }
  if (command === 'inspect') return inspectImage(resolve(required('image')));
  if (command === 'sam-setup') return setupSam(values.segmentation!);
  if (command === 'prepare') return prepare(required('image'), values.workdir ?? resolve('output', 'plans', basename(required('image'))), values.prompt, values.background);
  if (command === 'list') return { projects: await listProjects(output) };
  if (command === 'preview') {
    const viewer = await startPreview(output, Number(values.port));
    return { ...viewer, url: values.id ? `${viewer.url}/?project=${encodeURIComponent(values.id)}` : viewer.url, output };
  }
  if (command === 'validate' || command === 'build') {
    const image = resolve(required('image'));
    const analysis = await readJson(required('analysis'));
    const motion = values.motion ? await readJson(values.motion) : undefined;
    if (command === 'validate') {
      const meta = await sharp(image).rotate().png().toBuffer().then((buffer) => sharp(buffer).metadata());
      const validated = normalizePlan(analysis, { width: meta.width!, height: meta.height! });
      if (motion !== undefined) validateMotion(motion, new Set(validated.parts.map((part) => part.name)));
      return { valid: true, parts: validated.parts.length, category: validated.plan.category, warnings: validated.warnings };
    }
    const result = await buildAnimation({ image, analysis, motion, output, project: required('project'), name: values.name,
      target: values.target, density: values.density ? Number(values.density) : undefined,
      blink: values.blink, background: !values['keep-background'], replace: values.replace,
      editable: values.editable, spineCliPath: values['spine-cli'],
      segmentation: values.segmentation as SegmentationMode,
      backgroundMode: (values['keep-background'] ? 'preserve' : values.background) as 'auto' | 'transparent' | 'preserve',
      matteColor: values['matte-color'], title: values.title,
      onLog: (message) => console.error(`[spine] ${message}`) });
    const viewer = values.preview ? await startPreview(output, Number(values.port)) : undefined;
    return { ...result, ...(viewer ? { previewUrl: `${viewer.url}/?project=${encodeURIComponent(result.manifest.id)}` } : {}) };
  }
  throw new Error(`未知命令: ${command}`);
}

try {
  const result = await main();
  process.stdout.write(JSON.stringify({ ok: command !== 'doctor' || result.ready !== false, result }, null, 2) + '\n');
}
catch (error) {
  process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }, null, 2) + '\n');
  process.exitCode = 1;
}
