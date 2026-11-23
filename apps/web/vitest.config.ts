import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Svelte components are compiled for tests too; `browser` resolves Svelte's client runtime.
  // Explicit root and config file: the root `vitest run` loads this file as a project.
  root,
  plugins: [svelte({ configFile: `${root}svelte.config.js` })],
  resolve: { conditions: ['browser'] },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
