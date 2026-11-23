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
