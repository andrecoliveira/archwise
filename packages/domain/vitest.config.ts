import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'domain', include: ['tests/**/*.test.ts'] } });
