import { describe, expect, test } from 'vitest';
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
  scanSummary,
} from '../src/inventory-output.js';
import { formatSessionList } from '../src/store-runtime.js';
import { repository } from './inventory-fixture.js';

const result: InventoryResult = {
  version: 2,
  roots: ['/Users/alex/work/shop'],
  repositories: [
    repository({ id: 'repo-root', label: 'shop', path: '', nested: false }),
    repository({ id: 'repo-0123456789abcdef', label: 'sub', path: 'libs/sub', nested: true }),
  ],
  manifests: [
    {
      repositoryId: 'repo-root',
      rootId: 'repo-root',
      path: 'apps/api/package.json',
      name: '@shop/api',
      framework: 'fastify',
      dependencies: ['fastify', 'vitest'],
      runtimeDependencies: ['fastify'],
      devDependencies: ['vitest'],
      workspaces: null,
      sha256: 'a'.repeat(64),
    },
  ],
  files: [
    {
      repositoryId: 'repo-root',
      rootId: 'repo-root',
      path: 'compose.yaml',
      text: 'services: {}',
      problem: null,
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

test('a single repository keeps the flat manifest list', () => {
  const single = { ...result, repositories: [result.repositories[0]!] };
  expect(formatInventorySummary(single)).toBe(
    [
      'Archwise — local inventory (1 manifest, 120 entries, 1 repository)',
      '- apps/api/package.json: @shop/api [fastify]',
      'Skipped: ignored-builtin 3, symlink 1',
      '',
    ].join('\n'),
  );
});

test('the summary lists counts, manifests and skip reasons in a stable order', () => {
  expect(formatInventorySummary(result)).toBe(
    [
      'Archwise — local inventory (1 manifest, 120 entries, 2 repositories)',
      'Repository shop: 0 manifests, 0 entries',
      '- apps/api/package.json: @shop/api [fastify]',
      'Repository sub: 0 manifests, 0 entries',
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
  expect(text).not.toContain(result.roots[0]);
  expect(text).not.toContain('durationMs');
  expect(text).toContain('a'.repeat(64));
});

test('portable --json manifests keep the Phase 3 fields only', () => {
  const portable = portableInventory(result) as { manifests: Record<string, unknown>[] };
  expect(Object.keys(portable.manifests[0]!)).toEqual([
    'repositoryId',
    'rootId',
    'path',
    'name',
    'framework',
    'dependencies',
    'sha256',
  ]);
  expect('files' in portable).toBe(false);
  expect(JSON.stringify(portable)).not.toContain('services: {}');
});

test.each([
  ['not-found', 'Workspace root not found: ./x. Pass an existing directory with --path.'],
  ['not-directory', 'Workspace root is not a directory: ./x. Pass a directory with --path.'],
  ['unreadable', 'Workspace root is not readable: ./x. Check its permissions.'],
] as const)('root error %s has a stable message', (reason, message) => {
  expect(rootErrorMessage(new InventoryRootError(reason), [{ path: './x', flag: '--path' }])).toBe(
    message,
  );
});

test('a root error names the failing input and its flag', () => {
  const roots = [
    { path: './a', flag: '--repo' },
    { path: './b', flag: '--repo' },
  ];
  expect(rootErrorMessage(new InventoryRootError('not-found', 1), roots)).toBe(
    'Workspace root not found: ./b. Pass an existing directory with --repo.',
  );
});

test('other errors are not root errors', () => {
  expect(rootErrorMessage(new Error('boom'), [{ path: './x', flag: '--path' }])).toBeNull();
});

test('runScan reports cancellation instead of throwing', async () => {
  const aborting: WorkspaceInventory = {
    inspect: () => Promise.reject(new DOMException('Aborted', 'AbortError')),
  };
  expect(await runScan(aborting, { roots: [{ path: '.' }], knownHomes: [] })).toEqual({
    kind: 'cancelled',
  });
  const working: WorkspaceInventory = { inspect: () => Promise.resolve(result) };
  expect(await runScan(working, { roots: [{ path: '.' }], knownHomes: [] })).toEqual({
    kind: 'done',
    result,
  });
  const failing: WorkspaceInventory = { inspect: () => Promise.reject(new Error('boom')) };
  await expect(runScan(failing, { roots: [{ path: '.' }], knownHomes: [] })).rejects.toThrow(
    'boom',
  );
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

test('the scan record lists every analyzer version, sorted', () => {
  const record = scanRecord(result, 'a', 'b', [
    { id: 'prisma-schema', version: '1.0.0' },
    { id: 'docker-compose', version: '1.0.0' },
  ]);
  expect(record.analyzers).toEqual([
    { id: 'docker-compose', version: '1.0.0' },
    { id: 'node-manifest', version: '1.0.0' },
    { id: 'prisma-schema', version: '1.0.0' },
  ]);
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

describe('several repositories', () => {
  const apiId = 'repo-1111111111111111';
  const webId = 'repo-2222222222222222';
  const multi: InventoryResult = {
    ...result,
    roots: ['/Users/alex/api', '/Users/alex/web'],
    repositories: [
      repository({
        id: apiId,
        rootId: apiId,
        label: 'api',
        path: '',
        nested: false,
        listedEntries: 80,
        manifests: 1,
        skipped: { 'ignored-builtin': 3 },
      }),
      repository({
        id: webId,
        rootId: webId,
        label: 'web',
        path: '',
        nested: false,
        reached: false,
      }),
    ],
    manifests: [
      { ...result.manifests[0]!, repositoryId: apiId, rootId: apiId, path: 'package.json' },
    ],
    skipped: { 'ignored-builtin': { count: 3, examples: ['api/node_modules'] } },
    truncated: 'entries',
  };

  test('the summary lists each repository with its counts and manifests', () => {
    expect(formatInventorySummary(multi)).toBe(
      [
        'Archwise — local inventory (1 manifest, 120 entries, 2 repositories)',
        'Repository api: 1 manifest, 80 entries, skipped ignored-builtin 3',
        '- package.json: @shop/api [fastify]',
        'Repository web: not scanned, a budget ran out first.',
        'Skipped: ignored-builtin 3',
        'Scan truncated: entries budget reached. Results are partial.',
        '',
      ].join('\n'),
    );
  });

  test('portable JSON repositories carry counts and the root ID', () => {
    const portable = portableInventory(multi) as { repositories: Record<string, unknown>[] };
    expect(portable.repositories[0]).toEqual({
      id: apiId,
      rootId: apiId,
      label: 'api',
      path: '',
      nested: false,
      reached: true,
      listedEntries: 80,
      manifests: 1,
      skipped: { 'ignored-builtin': 3 },
    });
    expect(JSON.stringify(portable)).not.toContain('/Users/alex');
  });

  test('the scan summary has counts only', () => {
    const summary = scanSummary(multi);
    expect(summary).toEqual({
      version: 1,
      listedEntries: 120,
      skipped: { 'ignored-builtin': 3 },
      truncated: 'entries',
      repositories: [
        {
          id: apiId,
          label: 'api',
          nested: false,
          reached: true,
          listedEntries: 80,
          manifests: 1,
          skipped: { 'ignored-builtin': 3 },
        },
        {
          id: webId,
          label: 'web',
          nested: false,
          reached: false,
          listedEntries: 0,
          manifests: 0,
          skipped: {},
        },
      ],
    });
    expect(JSON.stringify(summary)).not.toContain('/');
  });
});
