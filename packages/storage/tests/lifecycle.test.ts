import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, test } from 'vitest';
import {
  MIGRATIONS,
  openStore,
  pruneBackups,
  SCHEMA_VERSION,
  StoreUnavailableError,
} from '../src/index.js';
import { tempDir } from './helpers.js';

const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
const dir = () => {
  const d = tempDir();
  cleanups.push(d.dispose);
  return d.path;
};
const dbPath = (d: string) => join(d, 'archwise.db');
const versionOf = (path: string): number => {
  const db = new DatabaseSync(path);
  try {
    return (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v;
  } finally {
    db.close();
  }
};

async function expectUnavailable(promise: Promise<unknown>, reason: string) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StoreUnavailableError);
  expect((error as StoreUnavailableError).reason).toBe(reason);
}

test('a fresh open creates the database at the current schema version', async () => {
  const d = dir();
  const store = await openStore(d);
  store.close();
  expect(existsSync(dbPath(d))).toBe(true);
  expect(versionOf(dbPath(d))).toBe(SCHEMA_VERSION);
  expect(store.backupPath).toBeNull();
  expect(store.quarantinedPath).toBeNull();
});

test('reopening an up-to-date store does not create a backup', async () => {
  const d = dir();
  (await openStore(d)).close();
  const again = await openStore(d);
  again.close();
  expect(again.backupPath).toBeNull();
  expect(readdirSync(d).some((name) => name.includes('.backup-'))).toBe(false);
});

test('migrating an older database writes a backup first', async () => {
  const d = dir();
  const legacy = new DatabaseSync(dbPath(d));
  legacy.exec("CREATE TABLE legacy(x TEXT); INSERT INTO legacy VALUES ('kept')");
  legacy.close();

  const store = await openStore(d);
  store.close();
  expect(store.backupPath).not.toBeNull();
  const backup = new DatabaseSync(store.backupPath!);
  try {
    expect(backup.prepare('SELECT x FROM legacy').get()).toEqual({ x: 'kept' });
  } finally {
    backup.close();
  }
  expect(versionOf(dbPath(d))).toBe(SCHEMA_VERSION);
});

test('a version 1 store migrates to version 2 with a backup and keeps its sessions', async () => {
  const d = dir();
  const v1 = await openStore(d, { migrations: MIGRATIONS.slice(0, 1) });
  v1.workspaces.resolve('/root/a', 'ws-a', '2026-11-16T00:00:00.000Z');
  v1.close();
  expect(versionOf(dbPath(d))).toBe(1);
  const v2 = await openStore(d);
  try {
    expect(v2.backupPath).toMatch(/archwise\.db\.backup-v1-/);
    expect(versionOf(dbPath(d))).toBe(2);
    expect(v2.workspaces.resolve('/root/a', 'ws-new', '2026-11-17T00:00:00.000Z').id).toBe('ws-a');
    expect(v2.scans.latest('ws-a')).toBeNull();
  } finally {
    v2.close();
  }
});

test('a database from a newer Archwise is refused untouched', async () => {
  const d = dir();
  const future = new DatabaseSync(dbPath(d));
  future.exec(
    "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL); INSERT INTO schema_migrations VALUES (99, '2030-01-01T00:00:00.000Z')",
  );
  future.close();
  const before = readFileSync(dbPath(d));
  await expectUnavailable(openStore(d), 'newer-schema');
  expect(readFileSync(dbPath(d)).equals(before)).toBe(true);
});

test('a corrupt file is quarantined and a fresh store starts', async () => {
  const d = dir();
  writeFileSync(dbPath(d), 'not a database '.repeat(300));
  const store = await openStore(d);
  try {
    expect(store.quarantinedPath).not.toBeNull();
    expect(readFileSync(store.quarantinedPath!, 'utf8')).toContain('not a database');
    store.workspaces.resolve('/root', 'ws-1', '2026-11-16T00:00:00.000Z');
  } finally {
    store.close();
  }
  expect(versionOf(dbPath(d))).toBe(SCHEMA_VERSION);
});

test('a failing migration rolls back and leaves the file unchanged', async () => {
  const d = dir();
  const legacy = new DatabaseSync(dbPath(d));
  legacy.exec("CREATE TABLE legacy(x TEXT); INSERT INTO legacy VALUES ('kept')");
  legacy.close();
  const before = readFileSync(dbPath(d));
  await expectUnavailable(
    openStore(d, {
      migrations: [{ version: 1, sql: 'CREATE TABLE ok(a TEXT); THIS IS NOT SQL;' }],
    }),
    'migration-failed',
  );
  expect(readFileSync(dbPath(d)).equals(before)).toBe(true);
});

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'an unwritable data directory is reported as unwritable',
  async () => {
    const parent = dir();
    const locked = join(parent, 'locked');
    mkdirSync(locked);
    chmodSync(locked, 0o500);
    cleanups.push(() => chmodSync(locked, 0o700));
    await expectUnavailable(openStore(join(locked, 'store')), 'unwritable');
  },
);

test('a data directory path that is a file is reported as unwritable', async () => {
  const parent = dir();
  const file = join(parent, 'not-a-directory');
  writeFileSync(file, 'x');
  await expectUnavailable(openStore(file), 'unwritable');
});

test('two handles on the same file can interleave writes', async () => {
  const d = dir();
  const a = await openStore(d);
  const b = await openStore(d);
  try {
    a.workspaces.resolve('/root', 'ws-1', '2026-11-16T00:00:00.000Z');
    a.revisions.insert({
      id: 'rev-1',
      workspaceId: 'ws-1',
      fingerprint: 'fp',
      createdAt: '2026-11-16T00:00:00.000Z',
      revision: {
        id: 'rev-1',
        workspaceId: 'ws-1',
        parentRevisionId: null,
        createdAt: '2026-11-16T00:00:00.000Z',
        status: 'partial',
        repositories: [],
        coverage: [],
        evidence: [],
        nodes: [],
        edges: [],
        diagnostics: [],
      },
      view: '{}',
    });
    a.sessions.insert({
      id: 'ses-1',
      workspaceId: 'ws-1',
      baseRevisionId: 'rev-1',
      createdAt: '2026-11-16T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      label: 'Shared',
      sandbox: '{}',
    });
    for (let i = 0; i < 50; i++) {
      const handle = i % 2 === 0 ? a : b;
      const stamp = new Date(Date.UTC(2026, 10, 16, 0, 1, i)).toISOString();
      expect(
        handle.sessions.update('ws-1', 'ses-1', { label: `Write ${i}`, updatedAt: stamp }),
      ).toBe(true);
    }
    expect(b.sessions.get('ws-1', 'ses-1')?.label).toBe('Write 49');
  } finally {
    a.close();
    b.close();
  }
});

test('parallel first opens from separate threads all succeed', async () => {
  const { Worker } = await import('node:worker_threads');
  const { pathToFileURL } = await import('node:url');
  const d = dir();
  const entry = pathToFileURL(join(import.meta.dirname, '../dist/index.js')).href;
  const code = `
    const { workerData, parentPort } = require('node:worker_threads');
    import(workerData.entry).then(async ({ openStore }) => {
      try {
        const store = await openStore(workerData.dir);
        store.close();
        parentPort.postMessage('ok');
      } catch (error) {
        parentPort.postMessage(String(error && (error.reason || error.message)));
      }
    });
  `;
  for (let trial = 0; trial < 3; trial++) {
    const trialDir = join(d, `trial-${trial}`);
    const results = await Promise.all(
      Array.from(
        { length: 4 },
        () =>
          new Promise<string>((accept) => {
            const worker = new Worker(code, { eval: true, workerData: { entry, dir: trialDir } });
            worker.once('message', (message: string) => {
              accept(message);
              void worker.terminate();
            });
          }),
      ),
    );
    expect(results).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(versionOf(join(trialDir, 'archwise.db'))).toBe(SCHEMA_VERSION);
  }
});

test('quarantine moves WAL and shared-memory companions with the corrupt file', async () => {
  const d = dir();
  writeFileSync(dbPath(d), 'not a database '.repeat(300));
  writeFileSync(`${dbPath(d)}-wal`, 'committed frames');
  writeFileSync(`${dbPath(d)}-shm`, 'shared memory');
  const store = await openStore(d);
  store.close();
  expect(readFileSync(`${store.quarantinedPath!}-wal`, 'utf8')).toBe('committed frames');
  // -shm is a rebuildable shared-memory index (no durable data); it must move, not survive intact.
  expect(existsSync(`${store.quarantinedPath!}-shm`)).toBe(true);
  expect(existsSync(`${dbPath(d)}-wal`)).toBe(false);
});

test('backup pruning keeps the newest backups by schema version, then time', () => {
  const d = dir();
  const names = [
    'archwise.db.backup-v9-2026-11-16T00-00-00.000Z',
    'archwise.db.backup-v10-2026-11-15T00-00-00.000Z',
    'archwise.db.backup-v10-2026-11-17T00-00-00.000Z',
    'archwise.db.backup-v2-2026-12-01T00-00-00.000Z',
    'archwise.db.backup-v11-2026-11-18T00-00-00.000Z',
  ];
  for (const name of names) writeFileSync(join(d, name), 'x');
  pruneBackups(d);
  expect(readdirSync(d).sort()).toEqual(
    [
      'archwise.db.backup-v10-2026-11-15T00-00-00.000Z',
      'archwise.db.backup-v10-2026-11-17T00-00-00.000Z',
      'archwise.db.backup-v11-2026-11-18T00-00-00.000Z',
    ].sort(),
  );
});

test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
  'a read-only store file is reported as unwritable',
  async () => {
    const d = dir();
    (await openStore(d)).close();
    for (const suffix of ['', '-wal', '-shm']) {
      if (existsSync(`${dbPath(d)}${suffix}`)) chmodSync(`${dbPath(d)}${suffix}`, 0o400);
    }
    cleanups.push(() => chmodSync(dbPath(d), 0o600));
    await expectUnavailable(openStore(d), 'unwritable');
  },
);
