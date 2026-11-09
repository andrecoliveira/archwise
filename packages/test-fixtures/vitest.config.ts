import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { name: 'test-fixtures', include: ['tests/**/*.test.ts'] } });
