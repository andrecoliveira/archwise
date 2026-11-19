import {
  InventoryRootError,
  SKIP_REASONS,
  scanWorkspace,
  type InventoryRequest,
  type InventoryResult,
  type StoredScan,
  type WorkspaceInventory,
} from '@archwise/application';
import { MANIFEST_ANALYZER } from './revision.js';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

/** The default human-readable output: counts, manifests, skip reasons and truncation. */
export function formatInventorySummary(result: InventoryResult): string {
  const lines = [
    `Archwise — local inventory (${plural(result.manifests.length, 'manifest', 'manifests')}, ` +
      `${plural(result.listedEntries, 'entry', 'entries')}, ` +
      `${plural(result.repositories.length, 'repository', 'repositories')})`,
    ...result.manifests.map(
      (item) => `- ${item.path}: ${item.name} [${item.framework ?? 'unknown framework'}]`,
    ),
  ];
  const skipped = SKIP_REASONS.flatMap((reason) => {
    const count = result.skipped[reason]?.count ?? 0;
    return count > 0 ? [`${reason} ${count}`] : [];
  });
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
    repositories: result.repositories.map(({ id, label, path, nested }) => ({
      id,
      label,
      path,
      nested,
    })),
    manifests: result.manifests,
    listedEntries: result.listedEntries,
    skipped: result.skipped,
    truncated: result.truncated,
    diagnostics: result.diagnostics,
  };
}

/** Stable, documented messages for roots that cannot be scanned; null for other errors. */
export function rootErrorMessage(error: unknown, input: string): string | null {
  if (!(error instanceof InventoryRootError)) return null;
  switch (error.reason) {
    case 'not-found':
      return `Workspace root not found: ${input}. Pass an existing directory with --path.`;
    case 'not-directory':
      return `Workspace root is not a directory: ${input}. Pass a directory with --path.`;
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
