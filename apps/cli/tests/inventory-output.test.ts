import { expect, test } from 'vitest';
import {
  InventoryRootError,
  type InventoryResult,
  type WorkspaceInventory,
} from '@archwise/application';
import {
  formatInventorySummary,
  portableInventory,
  rootErrorMessage,
  runScan,
  scanRecord,
} from '../src/inventory-output.js';
import { formatSessionList } from '../src/store-runtime.js';

const result: InventoryResult = {
  version: 2,
  root: '/Users/alex/work/shop',
  repositories: [
    { id: 'repo-root', label: 'shop', path: '', nested: false },
    { id: 'repo-0123456789abcdef', label: 'sub', path: 'libs/sub', nested: true },
  ],
  manifests: [
    {
      repositoryId: 'repo-root',
      path: 'apps/api/package.json',
      name: '@shop/api',
      framework: 'fastify',
      dependencies: ['fastify'],
      sha256: 'a'.repeat(64),
    },
  ],
  listedEntries: 120,
  bytesRead: 400,
  skipped: {
    symlink: { count: 1, examples: ['link'] },
    'ignored-builtin': { count: 3, examples: ['.git', 'dist', 'node_modules'] },
  },
  truncated: null,
  diagnostics: [],
  durationMs: 12.5,
};

test('the summary lists counts, manifests and skip reasons in a stable order', () => {
  expect(formatInventorySummary(result)).toBe(
    [
      'Archwise — local inventory (1 manifest, 120 entries, 2 repositories)',
      '- apps/api/package.json: @shop/api [fastify]',
      'Skipped: ignored-builtin 3, symlink 1',
      '',
    ].join('\n'),
  );
});

test('a truncated scan says so', () => {
  const text = formatInventorySummary({ ...result, skipped: {}, truncated: 'entries' });
  expect(text).toContain('Scan truncated: entries budget reached. Results are partial.\n');
  expect(text).not.toContain('Skipped:');
});

test('portable JSON is an allowlist without the root or timing', () => {
  const portable = portableInventory(result) as Record<string, unknown>;
  expect(Object.keys(portable)).toEqual([
    'version',
    'repositories',
    'manifests',
    'listedEntries',
    'skipped',
    'truncated',
    'diagnostics',
  ]);
  const text = JSON.stringify(portable);
  expect(text).not.toContain(result.root);
  expect(text).not.toContain('durationMs');
  expect(text).toContain('a'.repeat(64));
});

test.each([
  ['not-found', 'Workspace root not found: ./x. Pass an existing directory with --path.'],
  ['not-directory', 'Workspace root is not a directory: ./x. Pass a directory with --path.'],
  ['unreadable', 'Workspace root is not readable: ./x. Check its permissions.'],
] as const)('root error %s has a stable message', (reason, message) => {
  expect(rootErrorMessage(new InventoryRootError(reason), './x')).toBe(message);
});

test('other errors are not root errors', () => {
  expect(rootErrorMessage(new Error('boom'), './x')).toBeNull();
});

test('runScan reports cancellation instead of throwing', async () => {
  const aborting: WorkspaceInventory = {
    inspect: () => Promise.reject(new DOMException('Aborted', 'AbortError')),
  };
  expect(await runScan(aborting, { root: '.', knownHomes: [] })).toEqual({ kind: 'cancelled' });
  const working: WorkspaceInventory = { inspect: () => Promise.resolve(result) };
  expect(await runScan(working, { root: '.', knownHomes: [] })).toEqual({ kind: 'done', result });
  const failing: WorkspaceInventory = { inspect: () => Promise.reject(new Error('boom')) };
  await expect(runScan(failing, { root: '.', knownHomes: [] })).rejects.toThrow('boom');
});

test('the scan record carries counts and codes only', () => {
  const record = scanRecord(
    { ...result, truncated: 'time' },
    '2026-11-19T00:00:00.000Z',
    '2026-11-19T00:00:01.000Z',
  );
  expect(record).toEqual({
    startedAt: '2026-11-19T00:00:00.000Z',
    finishedAt: '2026-11-19T00:00:01.000Z',
    listedEntries: 120,
    bytesRead: 400,
    skipped: { 'ignored-builtin': 3, symlink: 1 },
    truncated: 'time',
    analyzers: [{ id: 'node-manifest', version: '1.0.0' }],
  });
  expect(JSON.stringify(record)).not.toContain('/');
});

test('the session list shows the last scan', () => {
  const text = formatSessionList([], {
    id: 'scan-1',
    workspaceId: 'ws',
    revisionId: 'rev',
    ...scanRecord(result, '2026-11-19T00:00:00.000Z', '2026-11-19T00:00:01.000Z'),
  });
  expect(text).toBe('No saved sessions for this project.\nLast scan: 2026-11-19T00:00:01.000Z\n');
});
