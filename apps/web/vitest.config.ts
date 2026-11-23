import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Svelte components are compiled for tests too; `browser` resolves Svelte's client runtime.
  plugins: [svelte()],
  resolve: { conditions: ['browser'] },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
