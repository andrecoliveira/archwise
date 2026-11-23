import { expect, test } from 'vitest';
import { analysisInputs, type InventoryResult } from '../src/index.js';

const base = (over: Partial<InventoryResult>): InventoryResult => ({
  version: 2,
  roots: ['/w'],
  repositories: [],
  manifests: [],
  files: [],
  listedEntries: 0,
  bytesRead: 0,
  skipped: {},
  truncated: null,
  diagnostics: [],
  durationMs: 0,
  ...over,
});

const repository = (id: string, path: string, reached = true) => ({
  id,
  label: id,
  rootId: 'repo-root',
  path,
  nested: path !== '',
  reached,
  listedEntries: 0,
  manifests: 0,
  skipped: {},
});

test('converts root-relative paths to repository-relative ones', () => {
  const inputs = analysisInputs(
    base({
      repositories: [repository('repo-root', ''), repository('repo-lib', 'vendor/lib')],
      manifests: [
        {
          repositoryId: 'repo-lib',
          rootId: 'repo-root',
          path: 'vendor/lib/package.json',
          name: 'lib',
          framework: null,
          dependencies: ['pg', 'vitest'],
          runtimeDependencies: ['pg'],
          devDependencies: ['vitest'],
          workspaces: null,
          sha256: 'x',
        },
        {
          repositoryId: 'repo-root',
          rootId: 'repo-root',
          path: 'apps/web/package.json',
          name: 'web',
          framework: null,
          dependencies: [],
          runtimeDependencies: [],
          devDependencies: [],
          workspaces: null,
          sha256: 'y',
        },
      ],
      files: [
        {
          repositoryId: 'repo-lib',
          rootId: 'repo-root',
          path: 'vendor/lib/compose.yaml',
          text: 'a',
          problem: null,
        },
      ],
    }),
  );
  expect(inputs).toEqual([
    {
      repository: { id: 'repo-lib', label: 'repo-lib' },
      packages: [
        {
          path: 'package.json',
          directory: '',
          name: 'lib',
          dependencies: ['pg'],
          devDependencies: ['vitest'],
          workspaces: null,
        },
      ],
      files: [{ path: 'compose.yaml', text: 'a', problem: null }],
    },
    {
      repository: { id: 'repo-root', label: 'repo-root' },
      packages: [
        {
          path: 'apps/web/package.json',
          directory: 'apps/web',
          name: 'web',
          dependencies: [],
          devDependencies: [],
          workspaces: null,
        },
      ],
      files: [],
    },
  ]);
});

test('omits unreached repositories', () => {
  expect(analysisInputs(base({ repositories: [repository('repo-x', '', false)] }))).toEqual([]);
});
