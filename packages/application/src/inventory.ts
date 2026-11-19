/*
 * Workspace inventory port. Discovery adapters implement it; use cases depend only on these
 * types. `InventoryResult.root` is the canonical absolute root: it stays in the process and is
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
  /** Path relative to the user root ('' for the root itself), '/'-separated. */
  readonly path: string;
  readonly nested: boolean;
}

export interface InventoryManifest {
  readonly repositoryId: string;
  /** Path relative to the user root, '/'-separated. */
  readonly path: string;
  readonly name: string;
  readonly framework: string | null;
  readonly dependencies: readonly string[];
  readonly sha256: string;
}

export interface SkipSummary {
  readonly count: number;
  /** Up to 20 relative paths, the first in code-unit order. */
  readonly examples: readonly string[];
}

export interface InventoryResult {
  readonly version: 2;
  /** Canonical absolute user root; process-local, never serialized to outputs. */
  readonly root: string;
  readonly repositories: readonly InventoryRepository[];
  readonly manifests: readonly InventoryManifest[];
  readonly listedEntries: number;
  readonly bytesRead: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, SkipSummary>>>;
  readonly truncated: BudgetName | null;
  readonly diagnostics: readonly string[];
  readonly durationMs: number;
}

export interface InventoryRequest {
  readonly root: string;
  readonly knownHomes: readonly string[];
  readonly budgets?: Partial<InventoryBudgets>;
  readonly signal?: AbortSignal;
  /** Milliseconds clock, injectable for time-budget tests. */
  readonly now?: () => number;
  readonly onProgress?: (listedEntries: number) => void;
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
