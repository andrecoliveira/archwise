/*
 * Workspace inventory port. Discovery adapters implement it; use cases depend only on these
 * types. `InventoryResult.roots` are canonical absolute paths: they stay in the process and are
 * never serialized to outputs, the API or a revision.
 */

export const SKIP_REASONS = [
  'ignored-builtin',
  'ignored-gitignore',
  'symlink',
  'outside-root',
  'nested-repository',
  'too-deep',
  'too-large',
  'binary',
  'unreadable',
  'special-file',
  'budget-exhausted',
  'unsupported-name',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type BudgetName = 'entries' | 'depth' | 'bytes-per-file' | 'bytes-total' | 'time';

export interface InventoryBudgets {
  readonly entries: number;
  readonly depth: number;
  readonly bytesPerFile: number;
  readonly bytesTotal: number;
  readonly timeMs: number;
}

export const DEFAULT_BUDGETS: InventoryBudgets = Object.freeze({
  entries: 200_000,
  depth: 32,
  bytesPerFile: 1_048_576,
  bytesTotal: 67_108_864,
  timeMs: 60_000,
});

export interface InventoryRepository {
  readonly id: string;
  readonly label: string;
  /** ID of the user root that contains this repository; its own ID for a user root. */
  readonly rootId: string;
  /** Path relative to that user root ('' for the root itself), '/'-separated. */
  readonly path: string;
  readonly nested: boolean;
  /** False only for a user root a budget left unscanned. */
  readonly reached: boolean;
  readonly listedEntries: number;
  readonly manifests: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
}

export interface InventoryManifest {
  readonly repositoryId: string;
  /** ID of the user root the path is relative to. */
  readonly rootId: string;
  /** Path relative to the user root, '/'-separated. */
  readonly path: string;
  readonly name: string;
  readonly framework: string | null;
  /** Runtime and dev dependency names, merged and sorted (Phase 3 shape). */
  readonly dependencies: readonly string[];
  /** `dependencies` only. */
  readonly runtimeDependencies: readonly string[];
  readonly devDependencies: readonly string[];
  /** `workspaces` globs (array or `{ packages }`), else null. */
  readonly workspaces: readonly string[] | null;
  readonly sha256: string;
}

/** A file read for analyzers. Process-local: its text is never serialized to outputs. */
export interface InventoryFile {
  readonly repositoryId: string;
  readonly rootId: string;
  /** Path relative to the user root, '/'-separated, like manifests. */
  readonly path: string;
  /** UTF-8 text; null when `problem` is set. */
  readonly text: string | null;
  readonly problem: 'too-large' | 'binary' | 'unreadable' | null;
}

/** Files analyzers declare; matched by exact base name or name suffix. */
export interface InventoryInputs {
  readonly fileNames: readonly string[];
  readonly extensions: readonly string[];
}

export interface SkipSummary {
  readonly count: number;
  /** Up to 20 relative paths, the first in code-unit order. */
  readonly examples: readonly string[];
}

export interface InventoryResult {
  readonly version: 2;
  /** Canonical absolute user roots in scan (ID) order; process-local, never serialized. */
  readonly roots: readonly string[];
  readonly repositories: readonly InventoryRepository[];
  readonly manifests: readonly InventoryManifest[];
  /** Analyzer input files (never package.json, never deny-listed); process-local. */
  readonly files: readonly InventoryFile[];
  readonly listedEntries: number;
  readonly bytesRead: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, SkipSummary>>>;
  readonly truncated: BudgetName | null;
  readonly diagnostics: readonly string[];
  readonly durationMs: number;
}

/** One user root as requested on the command line or in a workspace file. */
export interface RootRequest {
  readonly path: string;
  readonly label?: string;
}

export interface InventoryProgress {
  readonly listedEntries: number;
  /** Label of the repository being scanned. */
  readonly repository: string;
  readonly elapsedMs: number;
}

export interface InventoryRequest {
  readonly roots: readonly RootRequest[];
  readonly knownHomes: readonly string[];
  readonly budgets?: Partial<InventoryBudgets>;
  /** Files to read for analyzers, besides package manifests. */
  readonly inputs?: InventoryInputs;
  readonly signal?: AbortSignal;
  /** Milliseconds clock, injectable for time-budget tests. */
  readonly now?: () => number;
  readonly onProgress?: (progress: InventoryProgress) => void;
}

export interface WorkspaceInventory {
  inspect(request: InventoryRequest): Promise<InventoryResult>;
}

/** Runs the inventory through the port; recording happens when sessions open (see SessionService). */
export function scanWorkspace(
  inventory: WorkspaceInventory,
  request: InventoryRequest,
): Promise<InventoryResult> {
  return inventory.inspect(request);
}

export type InventoryRootFailure = 'not-found' | 'not-directory' | 'unreadable';

/** A user root that cannot be scanned. Carries no path, so it is safe to log. */
export class InventoryRootError extends Error {
  readonly reason: InventoryRootFailure;
  /** Index of the failing root in the request. */
  readonly index: number;
  constructor(reason: InventoryRootFailure, index = 0) {
    super(`Workspace root ${reason}`);
    this.name = 'InventoryRootError';
    this.reason = reason;
    this.index = index;
  }
}
