/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      'waku-navigation': resolve('src'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/vitest-setup.ts'],
  },
});
