import type { Graph } from './graph-types.js';
import type { ScanSummaryView } from './scan-summary.js';

/*
 * The revision chip in the top bar: when the scan ran, whether it is complete, and whether the
 * Studio is showing that scan or an earlier one. It states only what is true today; there is no
 * revision number because revisions are not counted (spec §12.1).
 */

export interface ChipInput {
  readonly scan: ScanSummaryView | null;
  readonly graph: Graph;
  readonly storeEnabled: boolean;
  readonly historical: boolean;
  readonly now: number;
}

export interface Chip {
  readonly text: string;
  readonly status: 'complete' | 'partial';
  readonly reasons: string[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const pad = (value: number): string => String(value).padStart(2, '0');

/** "just now", "N min ago", "N h ago", or the local date; null for an unparseable time. */
export function relativeTime(iso: string, now: number): string | null {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const age = Math.max(0, now - time);
  if (age < MINUTE) return 'just now';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} min ago`;
  if (age < 24 * HOUR) return `${Math.floor(age / HOUR)} h ago`;
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Why a scan is partial, in a fixed order. Empty means complete. */
function partialReasons(scan: ScanSummaryView | null, graph: Graph): string[] {
  const reasons: string[] = [];
  if (scan?.truncated) reasons.push(`the ${scan.truncated} budget ran out`);
  for (const repository of scan?.repositories ?? []) {
    if (!repository.reached) reasons.push(`${repository.label} was not scanned`);
  }
  if (graph.diagnostics.some((line) => line.startsWith('Analyzer failed')))
    reasons.push('an analyzer failed');
  if (graph.gaps.some((gap) => gap.reason === 'budget'))
    reasons.push('an analyzer ran out of budget');
  return reasons;
}

export function revisionChip({ scan, graph, storeEnabled, historical, now }: ChipInput): Chip {
  const reasons = partialReasons(scan, graph);
  const status = reasons.length === 0 ? 'complete' : 'partial';
  const parts: string[] = [];
  if (scan) {
    const when = scan.scannedAt === undefined ? null : relativeTime(scan.scannedAt, now);
    parts.push(when === null ? 'scan time unknown' : `scanned ${when}`);
  }
  parts.push(status);
  if (!storeEnabled) parts.push('not saved');
  if (historical) parts.push('viewing an earlier architecture');
  return { text: parts.join(' · '), status, reasons };
}

/** The workspace name for the top bar: its one repository's label, or how many there are. */
export function workspaceName(scan: ScanSummaryView | null): string {
  const repositories = scan?.repositories ?? [];
  if (repositories.length === 1) return repositories[0]!.label;
  if (repositories.length > 1) return `${repositories.length} repositories`;
  return 'Workspace';
}
