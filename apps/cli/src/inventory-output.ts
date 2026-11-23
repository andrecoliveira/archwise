import {
  InventoryRootError,
  SKIP_REASONS,
  scanWorkspace,
  type BudgetName,
  type InventoryManifest,
  type InventoryRequest,
  type InventoryResult,
  type SkipReason,
  type StoredScan,
  type WorkspaceInventory,
} from '@archwise/application';
import { MANIFEST_ANALYZER } from './revision.js';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

const skipCounts = (counts: Readonly<Partial<Record<SkipReason, number>>>): string[] =>
  SKIP_REASONS.flatMap((reason) => {
    const count = counts[reason] ?? 0;
    return count > 0 ? [`${reason} ${count}`] : [];
  });

const manifestLine = (item: InventoryManifest): string =>
  `- ${item.path}: ${item.name} [${item.framework ?? 'unknown framework'}]`;

/** The default human-readable output: counts, manifests, skip reasons and truncation. */
export function formatInventorySummary(result: InventoryResult): string {
  const lines = [
    `Archwise — local inventory (${plural(result.manifests.length, 'manifest', 'manifests')}, ` +
      `${plural(result.listedEntries, 'entry', 'entries')}, ` +
      `${plural(result.repositories.length, 'repository', 'repositories')})`,
  ];
  if (result.repositories.length === 1) {
    lines.push(...result.manifests.map(manifestLine));
  } else {
    for (const repository of result.repositories) {
      if (!repository.reached) {
        lines.push(`Repository ${repository.label}: not scanned, a budget ran out first.`);
        continue;
      }
      const skippedHere = skipCounts(repository.skipped);
      lines.push(
        `Repository ${repository.label}: ` +
          [
            plural(repository.manifests, 'manifest', 'manifests'),
            plural(repository.listedEntries, 'entry', 'entries'),
            ...(skippedHere.length > 0 ? [`skipped ${skippedHere.join(', ')}`] : []),
          ].join(', '),
        ...result.manifests.filter((m) => m.repositoryId === repository.id).map(manifestLine),
      );
    }
  }
  const skipped = skipCounts(
    Object.fromEntries(
      Object.entries(result.skipped).map(([reason, summary]) => [reason, summary.count]),
    ),
  );
  if (skipped.length > 0) lines.push(`Skipped: ${skipped.join(', ')}`);
  if (result.truncated !== null) {
    lines.push(`Scan truncated: ${result.truncated} budget reached. Results are partial.`);
  }
  return `${lines.join('\n')}\n`;
}

/** `--json` output. An allowlist: the absolute root and timings never leave the process. */
export function portableInventory(result: InventoryResult): object {
  return {
    version: result.version,
    repositories: result.repositories.map(
      ({ id, rootId, label, path, nested, reached, listedEntries, manifests, skipped }) => ({
        id,
        rootId,
        label,
        path,
        nested,
        reached,
        listedEntries,
        manifests,
        skipped,
      }),
    ),
    manifests: result.manifests.map(
      ({ repositoryId, rootId, path, name, framework, dependencies, sha256 }) => ({
        repositoryId,
        rootId,
        path,
        name,
        framework,
        dependencies,
        sha256,
      }),
    ),
    listedEntries: result.listedEntries,
    skipped: result.skipped,
    truncated: result.truncated,
    diagnostics: result.diagnostics,
  };
}

/** Stable, documented messages for roots that cannot be scanned; null for other errors. */
export function rootErrorMessage(
  error: unknown,
  roots: readonly { readonly path: string; readonly flag: string }[],
): string | null {
  if (!(error instanceof InventoryRootError)) return null;
  const root = roots[error.index] ?? roots[0] ?? { path: '.', flag: '--path' };
  const input = root.path;
  const flag = root.flag;
  switch (error.reason) {
    case 'not-found':
      return `Workspace root not found: ${input}. Pass an existing directory with ${flag}.`;
    case 'not-directory':
      return `Workspace root is not a directory: ${input}. Pass a directory with ${flag}.`;
    case 'unreadable':
      return `Workspace root is not readable: ${input}. Check its permissions.`;
  }
}

export type ScanOutcome =
  { readonly kind: 'done'; readonly result: InventoryResult } | { readonly kind: 'cancelled' };

/** Runs the inventory; an abort becomes `cancelled` instead of an exception. */
export async function runScan(
  inventory: WorkspaceInventory,
  request: InventoryRequest,
): Promise<ScanOutcome> {
  try {
    return { kind: 'done', result: await scanWorkspace(inventory, request) };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return { kind: 'cancelled' };
    throw error;
  }
}

/** What the store keeps about a scan: counts and codes, never paths. */
export function scanRecord(
  result: InventoryResult,
  startedAt: string,
  finishedAt: string,
): Omit<StoredScan, 'id' | 'workspaceId' | 'revisionId'> {
  const skipped: Partial<Record<(typeof SKIP_REASONS)[number], number>> = {};
  for (const reason of SKIP_REASONS) {
    const count = result.skipped[reason]?.count;
    if (count) skipped[reason] = count;
  }
  return {
    startedAt,
    finishedAt,
    listedEntries: result.listedEntries,
    bytesRead: result.bytesRead,
    skipped,
    truncated: result.truncated,
    analyzers: [{ id: MANIFEST_ANALYZER.id, version: MANIFEST_ANALYZER.version }],
  };
}

/** What the Studio's scan summary shows: counts and codes per repository, never paths. */
export interface ScanSummary {
  readonly version: 1;
  readonly listedEntries: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  readonly truncated: BudgetName | null;
  readonly repositories: readonly {
    readonly id: string;
    readonly label: string;
    readonly nested: boolean;
    readonly reached: boolean;
    readonly listedEntries: number;
    readonly manifests: number;
    readonly skipped: Readonly<Partial<Record<SkipReason, number>>>;
  }[];
}

export function scanSummary(result: InventoryResult): ScanSummary {
  const skipped: Partial<Record<SkipReason, number>> = {};
  for (const reason of SKIP_REASONS) {
    const count = result.skipped[reason]?.count;
    if (count) skipped[reason] = count;
  }
  return {
    version: 1,
    listedEntries: result.listedEntries,
    skipped,
    truncated: result.truncated,
    repositories: result.repositories.map(
      ({ id, label, nested, reached, listedEntries, manifests, skipped: counts }) => ({
        id,
        label,
        nested,
        reached,
        listedEntries,
        manifests,
        skipped: counts,
      }),
    ),
  };
}
