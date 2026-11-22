import type { GraphRevision } from '@archwise/domain';
import type { BudgetName, SkipReason } from './inventory.js';

/*
 * Application ports. Adapters (memory, SQLite) implement them; use cases depend only on these.
 * Absolute root paths live only in local storage and are never returned through the API.
 */

export interface Workspace {
  readonly id: string;
  /** The workspace key (see `workspaceKey`): one canonical root path, or a JSON array of them. */
  readonly rootPath: string;
  readonly createdAt: string;
}

export interface StoredRevision {
  readonly id: string;
  readonly workspaceId: string;
  readonly fingerprint: string;
  readonly createdAt: string;
  readonly revision: GraphRevision;
  /** The Studio's ArchitectureGraph JSON produced by the same discovery run. */
  readonly view: string;
}

export interface StoredSession {
  readonly id: string;
  readonly workspaceId: string;
  readonly baseRevisionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly label: string;
  /** archwise-sandbox v1 JSON text. */
  readonly sandbox: string;
}

export interface SessionChanges {
  readonly sandbox?: string;
  readonly label?: string;
  readonly updatedAt: string;
}

export interface WorkspaceRepository {
  /** Returns the workspace for `rootPath`, inserting it with `id` and `createdAt` when new. */
  resolve(rootPath: string, id: string, createdAt: string): Workspace;
}

export interface RevisionRepository {
  latest(workspaceId: string): StoredRevision | null;
  get(workspaceId: string, id: string): StoredRevision | null;
  insert(revision: StoredRevision): void;
}

export interface SessionRepository {
  get(workspaceId: string, id: string): StoredSession | null;
  /** Newest `updatedAt` first, then ascending ID. */
  list(workspaceId: string): readonly StoredSession[];
  insert(session: StoredSession): void;
  update(workspaceId: string, id: string, changes: SessionChanges): boolean;
  delete(workspaceId: string, id: string): boolean;
}

/** Metadata of one completed or truncated scan: counts and codes only, never paths. */
export interface StoredScan {
  readonly id: string;
  readonly workspaceId: string;
  readonly revisionId: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly listedEntries: number;
  readonly bytesRead: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  readonly truncated: BudgetName | null;
  readonly analyzers: readonly { readonly id: string; readonly version: string }[];
}

export interface ScanRepository {
  record(scan: StoredScan): void;
  /** Newest `finishedAt` first, then the highest ID. */
  latest(workspaceId: string): StoredScan | null;
}

export interface Store {
  readonly workspaces: WorkspaceRepository;
  readonly revisions: RevisionRepository;
  readonly sessions: SessionRepository;
  readonly scans: ScanRepository;
}

export interface Clock {
  /** Canonical UTC millisecond timestamp (domain format). */
  now(): string;
}

export interface IdGenerator {
  next(prefix: 'ws' | 'rev' | 'ses' | 'scan'): string;
}

export interface Digest {
  sha256Hex(text: string): string;
}
