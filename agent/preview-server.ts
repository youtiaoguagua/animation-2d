import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { listenPreview } from './preview.js';

const { values } = parseArgs({ options: { output: { type: 'string' }, port: { type: 'string', default: '3100' } } });
const output = resolve(values.output ?? 'output');
const server = await listenPreview(output, Number(values.port));
process.stdout.write(JSON.stringify({ service: 'spine-animation-preview', output, address: server.address() }) + '\n');
