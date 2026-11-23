import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'analyzers', include: ['tests/**/*.test.ts'] } });
