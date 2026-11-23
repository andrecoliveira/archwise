import { GAP_REASONS, kindLabel, type GraphGap, type GraphNode } from './graph-types.js';

/** Skip reasons in the CLI's documented order; unknown future reasons follow alphabetically. */
const REASON_ORDER = [
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
];

type Counts = Readonly<Record<string, number>>;

export interface ScanRepositoryView {
  readonly id: string;
  readonly label: string;
  readonly nested: boolean;
  readonly reached: boolean;
  readonly listedEntries: number;
  readonly manifests: number;
  readonly skipped: Counts;
}

/** `/api/v1/scan`: counts of the scan that produced the graph, never paths. */
export interface ScanSummaryView {
  readonly version: 1;
  /** When the scan started (ISO 8601). Absent from servers older than the Studio redesign. */
  readonly scannedAt?: string;
  readonly listedEntries: number;
  readonly skipped: Counts;
  readonly truncated: string | null;
  readonly repositories: readonly ScanRepositoryView[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

const isCounts = (value: unknown): value is Counts =>
  isRecord(value) && Object.values(value).every(isCount);

function isRepository(value: unknown): value is ScanRepositoryView {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.nested === 'boolean' &&
    typeof value.reached === 'boolean' &&
    isCount(value.listedEntries) &&
    isCount(value.manifests) &&
    isCounts(value.skipped)
  );
}

/** Validate external JSON as unknown before the browser consumes it. */
export function isScanSummary(value: unknown): value is ScanSummaryView {
  return (
    isRecord(value) &&
    value.version === 1 &&
    (value.scannedAt === undefined ||
      (typeof value.scannedAt === 'string' && !Number.isNaN(Date.parse(value.scannedAt)))) &&
    isCount(value.listedEntries) &&
    isCounts(value.skipped) &&
    (value.truncated === null || typeof value.truncated === 'string') &&
    Array.isArray(value.repositories) &&
    value.repositories.every(isRepository)
  );
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export function scanHeadline(summary: ScanSummaryView): string {
  const parts = [
    'Scan',
    plural(summary.repositories.length, 'repository', 'repositories'),
    plural(summary.listedEntries, 'entry', 'entries'),
  ];
  if (summary.truncated !== null) parts.push('partial');
  return parts.join(' · ');
}

export function repositoryLines(summary: ScanSummaryView): string[] {
  return summary.repositories.map((repository) =>
    repository.reached
      ? `${repository.label}: ${plural(repository.manifests, 'manifest', 'manifests')}, ` +
        plural(repository.listedEntries, 'entry', 'entries')
      : `${repository.label}: not scanned, a budget ran out first`,
  );
}

/** `Skipped: <reason> <count>, …`, or null when nothing was skipped. */
export function skippedLine(summary: ScanSummaryView): string | null {
  const rank = (reason: string): number => {
    const index = REASON_ORDER.indexOf(reason);
    return index === -1 ? REASON_ORDER.length : index;
  };
  const reasons = Object.entries(summary.skipped)
    .filter(([, count]) => count > 0)
    .sort(([a], [b]) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
  return reasons.length === 0
    ? null
    : `Skipped: ${reasons.map(([reason, count]) => `${reason} ${count}`).join(', ')}`;
}

/** Name, technology (or kind), and the repository when the workspace has several. */
export function nodeDisplayLabel(node: GraphNode): string {
  const parts = [node.label, node.technology ?? kindLabel(node.type)];
  if (node.repository) parts.push(node.repository.label);
  return parts.join(' · ');
}

/** Coverage gaps grouped by reason, in reason order: "Not analyzed (<reason>): a, b". */
export function gapLines(gaps: readonly GraphGap[]): string[] {
  return GAP_REASONS.flatMap((reason) => {
    const paths = gaps
      .filter((gap) => gap.reason === reason)
      .map((gap) => gap.path)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return paths.length === 0
      ? []
      : [`Not analyzed (${reason}): ${[...new Set(paths)].join(', ')}`];
  });
}
