import { defineConfig } from 'vite';
import { resolve } from 'path';

const isFirefox = process.env.TARGET_BROWSER === 'firefox';
const entry = process.env.ENTRY_NAME || 'all';

const input = entry === 'background'
  ? { background: resolve(__dirname, 'src/background.ts') }
  : entry === 'content_script'
  ? { content_script: resolve(__dirname, 'src/content_script.ts') }
  : {
      background: resolve(__dirname, 'src/background.ts'),
      content_script: resolve(__dirname, 'src/content_script.ts'),
    };

export default defineConfig({
  build: {
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input,
      output: {
        entryFileNames: '[name].js',
        format: isFirefox ? 'iife' : 'es',
      },
    },
  },
});
