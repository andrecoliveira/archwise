import type { GraphRevision } from '@archwise/domain';
import type { Store, StoredRevision, StoredScan, StoredSession } from '../ports.js';

/** Minimal injected test API so the contract does not depend on a test framework. */
export interface ContractHarness {
  readonly test: (name: string, fn: () => void | Promise<void>) => void;
  readonly expect: (value: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeNull(): void;
    not: { toBe(expected: unknown): void };
  };
}

const revisionFor = (id: string, workspaceId: string, createdAt: string): GraphRevision => ({
  id,
  workspaceId,
  parentRevisionId: null,
  createdAt,
  status: 'partial',
  repositories: [],
  coverage: [],
  evidence: [],
  nodes: [],
  edges: [],
  diagnostics: [],
});

const storedRevision = (id: string, workspaceId: string, createdAt: string): StoredRevision => ({
  id,
  workspaceId,
  fingerprint: `fp-${id}`,
  createdAt,
  revision: revisionFor(id, workspaceId, createdAt),
  view: '{"version":1}',
});

const session = (
  id: string,
  workspaceId: string,
  baseRevisionId: string,
  updatedAt: string,
): StoredSession => ({
  id,
  workspaceId,
  baseRevisionId,
  createdAt: '2026-11-16T00:00:00.000Z',
  updatedAt,
  label: `Label ${id}`,
  sandbox: '{"format":"archwise-sandbox","version":1,"nodes":[],"draft":{}}',
});

const scan = (id: string, workspaceId: string, finishedAt: string): StoredScan => ({
  id,
  workspaceId,
  revisionId: 'rev-1',
  startedAt: '2026-11-16T00:00:00.000Z',
  finishedAt,
  listedEntries: 42,
  bytesRead: 1024,
  skipped: { 'ignored-builtin': 3, symlink: 1 },
  truncated: null,
  analyzers: [{ id: 'node-manifest', version: '1.0.0' }],
});

/** Behavioral contract every Store adapter must satisfy. */
export function defineStoreContract(
  name: string,
  factory: () => { store: Store; dispose(): void } | Promise<{ store: Store; dispose(): void }>,
  t: ContractHarness,
): void {
  const run = (title: string, body: (store: Store) => void) =>
    t.test(`${name} store: ${title}`, async () => {
      const handle = await factory();
      try {
        body(handle.store);
      } finally {
        handle.dispose();
      }
    });

  run('resolves one workspace per root path', (store) => {
    const a = store.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
    const again = store.workspaces.resolve('/root/a', 'ws-other', '2026-11-17T00:00:00.000Z');
    const b = store.workspaces.resolve('/root/b', 'ws-b', '2026-11-16T00:00:00.000Z');
    t.expect(again).toEqual(a);
    t.expect(a.id).toBe('ws-a');
    t.expect(b.id).not.toBe(a.id);
  });

  run('round-trips revisions and returns the latest per workspace', (store) => {
    store.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
    store.workspaces.resolve('/root/b', 'ws-b', '2026-11-16T00:00:00.000Z');
    t.expect(store.revisions.latest('ws-a')).toBeNull();
    const first = storedRevision('rev-1', 'ws-a', '2026-11-16T00:00:01.000Z');
    const second = storedRevision('rev-2', 'ws-a', '2026-11-16T00:00:02.000Z');
    store.revisions.insert(first);
    store.revisions.insert(second);
    store.revisions.insert(storedRevision('rev-3', 'ws-b', '2026-11-16T00:00:03.000Z'));
    t.expect(store.revisions.get('ws-a', 'rev-1')).toEqual(first);
    t.expect(store.revisions.latest('ws-a')).toEqual(second);
    t.expect(store.revisions.get('ws-b', 'rev-1')).toBeNull();
  });

  run('lists sessions newest first and isolates workspaces', (store) => {
    store.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
    store.workspaces.resolve('/root/b', 'ws-b', '2026-11-16T00:00:00.000Z');
    store.revisions.insert(storedRevision('rev-1', 'ws-a', '2026-11-16T00:00:01.000Z'));
    store.revisions.insert(storedRevision('rev-2', 'ws-b', '2026-11-16T00:00:01.000Z'));
    store.sessions.insert(session('ses-old', 'ws-a', 'rev-1', '2026-11-16T00:00:05.000Z'));
    store.sessions.insert(session('ses-new', 'ws-a', 'rev-1', '2026-11-16T00:00:09.000Z'));
    store.sessions.insert(session('ses-b', 'ws-b', 'rev-2', '2026-11-16T00:00:07.000Z'));
    t.expect(store.sessions.list('ws-a').map((s) => s.id)).toEqual(['ses-new', 'ses-old']);
    t.expect(store.sessions.get('ws-b', 'ses-new')).toBeNull();
  });

  run('updates, refuses unknown ids and deletes sessions', (store) => {
    store.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
    store.revisions.insert(storedRevision('rev-1', 'ws-a', '2026-11-16T00:00:01.000Z'));
    store.sessions.insert(session('ses-1', 'ws-a', 'rev-1', '2026-11-16T00:00:05.000Z'));
    const changed = store.sessions.update('ws-a', 'ses-1', {
      label: 'Renamed',
      sandbox: '{"x":1}',
      updatedAt: '2026-11-16T00:00:06.000Z',
    });
    t.expect(changed).toBe(true);
    t.expect(store.sessions.get('ws-a', 'ses-1')).toEqual({
      ...session('ses-1', 'ws-a', 'rev-1', '2026-11-16T00:00:06.000Z'),
      label: 'Renamed',
      sandbox: '{"x":1}',
    });
    t.expect(
      store.sessions.update('ws-a', 'ses-missing', { updatedAt: '2026-11-16T00:00:07.000Z' }),
    ).toBe(false);
    t.expect(store.sessions.delete('ws-a', 'ses-1')).toBe(true);
    t.expect(store.sessions.delete('ws-a', 'ses-1')).toBe(false);
    t.expect(store.sessions.get('ws-a', 'ses-1')).toBeNull();
  });

  run('records scans and returns the newest per workspace', (store) => {
    store.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
    store.workspaces.resolve('/root/b', 'ws-b', '2026-11-16T00:00:00.000Z');
    store.revisions.insert(storedRevision('rev-1', 'ws-a', '2026-11-16T00:00:01.000Z'));
    store.revisions.insert(storedRevision('rev-2', 'ws-b', '2026-11-16T00:00:01.000Z'));
    t.expect(store.scans.latest('ws-a')).toBeNull();
    store.scans.record(scan('scan-1', 'ws-a', '2026-11-16T00:00:02.000Z'));
    store.scans.record({
      ...scan('scan-3', 'ws-a', '2026-11-16T00:00:09.000Z'),
      truncated: 'time',
    });
    store.scans.record(scan('scan-2', 'ws-a', '2026-11-16T00:00:09.000Z'));
    store.scans.record({
      ...scan('scan-9', 'ws-b', '2026-11-17T00:00:00.000Z'),
      revisionId: 'rev-2',
    });
    t.expect(store.scans.latest('ws-a')).toEqual({
      ...scan('scan-3', 'ws-a', '2026-11-16T00:00:09.000Z'),
      truncated: 'time',
    });
    t.expect(store.scans.latest('ws-b')?.id).toBe('scan-9');
  });
}
