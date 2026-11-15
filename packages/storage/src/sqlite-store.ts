import type {
  SessionChanges,
  Store,
  StoredRevision,
  StoredSession,
  Workspace,
} from '@archwise/application';
import { importGraphJson, serializeGraphRevision } from '@archwise/schemas';
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { MIGRATIONS, type Migration } from './migrations.js';

export type StoreUnavailableReason = 'newer-schema' | 'migration-failed' | 'unwritable';

/** The store cannot be used safely; the file (if any) was left unchanged. */
export class StoreUnavailableError extends Error {
  readonly reason: StoreUnavailableReason;
  constructor(reason: StoreUnavailableReason) {
    super(`Archwise local store unavailable: ${reason}`);
    this.name = 'StoreUnavailableError';
    this.reason = reason;
  }
}

export interface OpenedStore extends Store {
  readonly path: string;
  readonly quarantinedPath: string | null;
  readonly backupPath: string | null;
  close(): void;
}

export interface OpenStoreOptions {
  readonly now?: () => Date;
  readonly migrations?: readonly Migration[];
}

const DB_FILE = 'archwise.db';
const KEPT_BACKUPS = 3;
const CORRUPTION_CODES = new Set([11, 26]); // SQLITE_CORRUPT, SQLITE_NOTADB

const stampOf = (date: Date): string => date.toISOString().replace(/:/g, '-');

function isCorruption(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'errcode' in error &&
    CORRUPTION_CODES.has((error as { errcode: number }).errcode)
  );
}

function ensureWritableDirectory(dataDir: string): void {
  try {
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    if (!statSync(dataDir).isDirectory()) throw new Error('not a directory');
    accessSync(dataDir, constants.W_OK);
  } catch {
    throw new StoreUnavailableError('unwritable');
  }
}

function schemaVersion(db: DatabaseSync): number {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();
  if (!table) return 0;
  const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {
    version: number | null;
  };
  return row.version ?? 0;
}

/** Opens and checks an existing file. Returns null when it is corrupt. */
function openChecked(path: string): DatabaseSync | null {
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(path);
    const rows = db.prepare('PRAGMA integrity_check').all() as { integrity_check: string }[];
    if (rows.length === 1 && rows[0]!.integrity_check === 'ok') return db;
    db.close();
    return null;
  } catch (error) {
    db?.close();
    if (isCorruption(error)) return null;
    throw error;
  }
}

function pruneBackups(dataDir: string): void {
  const backups = readdirSync(dataDir)
    .filter((name) => name.startsWith(`${DB_FILE}.backup-`))
    .sort();
  for (const name of backups.slice(0, Math.max(0, backups.length - KEPT_BACKUPS))) {
    rmSync(join(dataDir, name), { force: true });
  }
}

function migrate(
  db: DatabaseSync,
  from: number,
  migrations: readonly Migration[],
  now: Date,
): void {
  const pending = migrations.filter((migration) => migration.version > from);
  if (pending.length === 0) return;
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)',
    );
    for (const migration of pending) {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        now.toISOString(),
      );
    }
    db.exec('COMMIT');
  } catch {
    try {
      db.exec('ROLLBACK');
    } catch {
      // The transaction may already be closed by SQLite.
    }
    throw new StoreUnavailableError('migration-failed');
  }
}

/**
 * Opens the local store: integrity check with quarantine, refusal of newer schemas, backup
 * before migrating, transactional migrations, then WAL and a busy timeout for concurrent
 * Archwise processes. WAL is enabled only after migrating so a failed migration leaves the
 * original file bytes untouched.
 */
export async function openStore(
  dataDir: string,
  options: OpenStoreOptions = {},
): Promise<OpenedStore> {
  const now = options.now ?? (() => new Date());
  const migrations = options.migrations ?? MIGRATIONS;
  const target = migrations[migrations.length - 1]?.version ?? 0;
  ensureWritableDirectory(dataDir);
  const path = join(dataDir, DB_FILE);

  let quarantinedPath: string | null = null;
  let db: DatabaseSync | null = null;
  if (existsSync(path)) {
    db = openChecked(path);
    if (!db) {
      quarantinedPath = `${path}.corrupt-${stampOf(now())}`;
      renameSync(path, quarantinedPath);
    }
  }
  db ??= new DatabaseSync(path);

  let backupPath: string | null = null;
  try {
    const version = schemaVersion(db);
    if (version > target) throw new StoreUnavailableError('newer-schema');
    if (version < target && quarantinedPath === null && statSync(path).size > 0) {
      backupPath = `${path}.backup-v${version}-${stampOf(now())}`;
      await backup(db, backupPath);
      pruneBackups(dataDir);
    }
    migrate(db, version, migrations, now());
    db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON');
  } catch (error) {
    db.close();
    throw error;
  }
  return createSqliteStore(db, path, quarantinedPath, backupPath);
}

interface RevisionRow {
  id: string;
  workspace_id: string;
  fingerprint: string;
  created_at: string;
  document: string;
  view_document: string;
}
interface SessionRow {
  id: string;
  workspace_id: string;
  base_revision_id: string;
  created_at: string;
  updated_at: string;
  label: string;
  sandbox_document: string;
}

function toRevision(row: RevisionRow | undefined): StoredRevision | null {
  if (!row) return null;
  const imported = importGraphJson(row.document);
  if (!imported.ok) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    fingerprint: row.fingerprint,
    createdAt: row.created_at,
    revision: imported.value,
    view: row.view_document,
  };
}

function toSession(row: SessionRow | undefined): StoredSession | null {
  if (!row) return null;
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    baseRevisionId: row.base_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    label: row.label,
    sandbox: row.sandbox_document,
  };
}

function createSqliteStore(
  db: DatabaseSync,
  path: string,
  quarantinedPath: string | null,
  backupPath: string | null,
): OpenedStore {
  const q = {
    findWorkspace: db.prepare(
      'SELECT id, root_path, created_at FROM workspaces WHERE root_path = ?',
    ),
    insertWorkspace: db.prepare(
      'INSERT INTO workspaces (id, root_path, created_at) VALUES (?, ?, ?) ON CONFLICT(root_path) DO NOTHING',
    ),
    latestRevision: db.prepare(
      'SELECT * FROM revisions WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    ),
    getRevision: db.prepare('SELECT * FROM revisions WHERE workspace_id = ? AND id = ?'),
    insertRevision: db.prepare(
      'INSERT INTO revisions (id, workspace_id, fingerprint, created_at, document, view_document) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    getSession: db.prepare('SELECT * FROM sessions WHERE workspace_id = ? AND id = ?'),
    listSessions: db.prepare(
      'SELECT * FROM sessions WHERE workspace_id = ? ORDER BY updated_at DESC, id ASC',
    ),
    insertSession: db.prepare(
      'INSERT INTO sessions (id, workspace_id, base_revision_id, created_at, updated_at, label, sandbox_document) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ),
    updateSession: db.prepare(
      'UPDATE sessions SET sandbox_document = COALESCE(?, sandbox_document), label = COALESCE(?, label), updated_at = ? WHERE workspace_id = ? AND id = ?',
    ),
    deleteSession: db.prepare('DELETE FROM sessions WHERE workspace_id = ? AND id = ?'),
  };

  return {
    path,
    quarantinedPath,
    backupPath,
    close: () => db.close(),
    workspaces: {
      resolve(rootPath, id, createdAt): Workspace {
        q.insertWorkspace.run(id, rootPath, createdAt);
        const row = q.findWorkspace.get(rootPath) as
          { id: string; root_path: string; created_at: string } | undefined;
        if (!row) throw new Error('Workspace resolution failed');
        return { id: row.id, rootPath: row.root_path, createdAt: row.created_at };
      },
    },
    revisions: {
      latest: (workspaceId) =>
        toRevision(q.latestRevision.get(workspaceId) as RevisionRow | undefined),
      get: (workspaceId, id) =>
        toRevision(q.getRevision.get(workspaceId, id) as RevisionRow | undefined),
      insert(revision) {
        const document = serializeGraphRevision(revision.revision);
        if (!document.ok) throw new Error('Refusing to store an invalid revision');
        q.insertRevision.run(
          revision.id,
          revision.workspaceId,
          revision.fingerprint,
          revision.createdAt,
          document.value,
          revision.view,
        );
      },
    },
    sessions: {
      get: (workspaceId, id) =>
        toSession(q.getSession.get(workspaceId, id) as SessionRow | undefined),
      list: (workspaceId) =>
        (q.listSessions.all(workspaceId) as unknown as SessionRow[]).map((row) => toSession(row)!),
      insert(session) {
        q.insertSession.run(
          session.id,
          session.workspaceId,
          session.baseRevisionId,
          session.createdAt,
          session.updatedAt,
          session.label,
          session.sandbox,
        );
      },
      update(workspaceId, id, changes: SessionChanges) {
        const result = q.updateSession.run(
          changes.sandbox ?? null,
          changes.label ?? null,
          changes.updatedAt,
          workspaceId,
          id,
        );
        return Number(result.changes) > 0;
      },
      delete: (workspaceId, id) => Number(q.deleteSession.run(workspaceId, id).changes) > 0,
    },
  };
}
