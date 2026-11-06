import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = dirname(fileURLToPath(import.meta.url));
const backend = process.env.SPINE_PREVIEW_URL || 'http://127.0.0.1:3100';

export default defineConfig({
  root: resolve(directory, 'studio'),
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: { '/api': backend, '/output': backend },
    fs: { allow: [resolve(directory, '..')] }
  },
  build: {
    outDir: resolve(directory, 'dist'),
    emptyOutDir: true,
    license: { fileName: 'third-party-licenses.md' },
    rolldownOptions: {
      input: { studio: resolve(directory, 'studio/index.html'), renderer: resolve(directory, 'renderer.js') },
      output: { entryFileNames: (chunk) => chunk.name === 'renderer' ? 'renderer.js' : 'assets/[name]-[hash].js' },
      preserveEntrySignatures: 'strict'
    }
  }
});
