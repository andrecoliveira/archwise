import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { createFixture } from '../src/index.js';
test('creates nested synthetic files and cleans up only its owned directory', async () => {
  const fixture = await createFixture({ 'src/main.ts': 'export const value = 1;' });
  try {
    expect(await readFile(join(fixture.root, 'src/main.ts'), 'utf8')).toContain('value = 1');
  } finally {
    await fixture.dispose();
  }
  await expect(access(fixture.root)).rejects.toThrow();
  await fixture.dispose();
});
test.each([
  '../escape',
  '/absolute',
  'C:/escape',
  'C:\\escape',
  '..\\escape',
  '',
  './a',
  'a/../b',
  'a//b',
])('rejects unsafe path %s', async (path) => {
  await expect(createFixture({ [path]: 'unsafe' })).rejects.toThrow(/relative/);
});
