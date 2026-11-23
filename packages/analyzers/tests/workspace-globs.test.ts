import { expect, test } from 'vitest';
import { matchesWorkspaceGlob } from '../src/index.js';

test.each<[string, string[], boolean]>([
  ['apps/web', ['apps/*'], true],
  ['apps/web/sub', ['apps/*'], false],
  ['packages/a/b', ['packages/**'], true],
  ['packages', ['packages/**'], true],
  ['packages/legacy', ['packages/*', '!packages/legacy'], false],
  ['packages/legacy', ['!packages/legacy', 'packages/*'], true],
  ['examples/demo', ['apps/*', 'packages/**'], false],
  ['tools/x', ['./tools/*/'], true],
  ['libs/ui', ['libs/ui'], true],
  ['apps/web-admin', ['apps/web*'], true],
])('%s matches %j → %s', (directory, patterns, expected) => {
  expect(matchesWorkspaceGlob(directory, patterns)).toBe(expected);
});

test('hostile patterns from an analyzed repository match in linear time', () => {
  const deep = Array.from({ length: 30 }, (_, i) => `d${i}`).join('/');
  const longName = `packages/${'a'.repeat(250)}`;
  const started = performance.now();
  expect(matchesWorkspaceGlob(deep, [Array(12).fill('**').join('/') + '/x'])).toBe(false);
  expect(matchesWorkspaceGlob(longName, ['packages/a*a*a*a*a*a*a*a*b'])).toBe(false);
  expect(matchesWorkspaceGlob(longName, ['packages/a*a*a*a*a*a*a*a*a'])).toBe(true);
  expect(performance.now() - started).toBeLessThan(200);
});
