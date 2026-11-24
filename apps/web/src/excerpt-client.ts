import type { Graph, GraphEvidence } from './graph-types.js';
import { evidenceKey } from './reason-catalog.js';

/*
 * "Show lines" (spec §5.11, ADR 0008): the browser asks the local server for an excerpt by the
 * opaque id the latest scan gave an evidence item. Results live only in component state.
 */

export type UnavailableReason =
  'denied' | 'outside-root' | 'too-long' | 'too-large' | 'not-utf8' | 'unreadable';

export type ExcerptResult =
  | {
      readonly status: 'ok';
      readonly path: string;
      readonly start: number;
      readonly end: number;
      readonly lines: readonly string[];
      /** File line numbers the server cut at 400 characters; [] from older servers. */
      readonly truncatedLines: readonly number[];
    }
  | { readonly status: 'changed' }
  | { readonly status: 'unavailable'; readonly reason: UnavailableReason }
  | { readonly status: 'error' };

const REASONS: Readonly<Record<UnavailableReason, string>> = {
  denied: 'Not shown: this file is on the deny list.',
  'outside-root': 'Not shown: the file is outside the scanned folder or behind a link.',
  'too-long': 'Not shown: the cited range is longer than 40 lines.',
  'too-large': "Not shown: the file is larger than the scan's size limit.",
  'not-utf8': 'Not shown: the file is not UTF-8 text.',
  unreadable: 'Not shown: the file could not be read.',
};

const ID = /^[0-9a-f]{64}$/;
type Shape = Record<string, unknown>;
const isRecord = (value: unknown): value is Shape =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

function parse(value: unknown): ExcerptResult {
  if (!isRecord(value)) return { status: 'error' };
  if (value.status === 'changed') return { status: 'changed' };
  if (
    value.status === 'unavailable' &&
    typeof value.reason === 'string' &&
    Object.hasOwn(REASONS, value.reason)
  ) {
    return { status: 'unavailable', reason: value.reason as UnavailableReason };
  }
  if (
    value.status === 'ok' &&
    typeof value.path === 'string' &&
    Number.isInteger(value.start) &&
    Number.isInteger(value.end) &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === 'string') &&
    (value.truncatedLines === undefined ||
      (Array.isArray(value.truncatedLines) && value.truncatedLines.every(Number.isInteger)))
  ) {
    return {
      status: 'ok',
      path: value.path,
      start: value.start as number,
      end: value.end as number,
      lines: value.lines,
      truncatedLines: (value.truncatedLines as number[] | undefined) ?? [],
    };
  }
  return { status: 'error' };
}

export async function fetchExcerpt(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<ExcerptResult> {
  if (!ID.test(id)) return { status: 'error' };
  try {
    const response = await fetcher(`/api/v1/evidence/excerpt/${id}`, {
      credentials: 'same-origin',
    });
    if (response.status !== 200 && response.status !== 422) return { status: 'error' };
    return parse(await response.json());
  } catch {
    return { status: 'error' };
  }
}

export const EXCERPT_MAX_LINE_CHARS = 400;

/** Says which lines were cut and how to read them whole; null when nothing was cut. */
export function truncationNote(result: Extract<ExcerptResult, { status: 'ok' }>): string | null {
  const cut = result.truncatedLines;
  if (cut.length === 0) return null;
  const at = `${result.path}:${cut[0]}`;
  return cut.length === 1
    ? `Line ${cut[0]} was cut at ${EXCERPT_MAX_LINE_CHARS} characters. Copy ${at} to open it in your editor.`
    : `${cut.length} lines were cut at ${EXCERPT_MAX_LINE_CHARS} characters (lines ${cut.join(', ')}). Copy ${at} to open the file in your editor.`;
}

/** The sentence shown instead of lines; null when there are lines to show. */
export function excerptMessage(result: ExcerptResult): string | null {
  switch (result.status) {
    case 'ok':
      return null;
    case 'changed':
      return 'This file changed since the scan.';
    case 'unavailable':
      return REASONS[result.reason];
    case 'error':
      return 'Could not load the lines. Try again.';
  }
}

/** Who cites an evidence item, plus the item: equal paths in two repositories stay apart. */
export function excerptOwnerKey(owner: string, item: GraphEvidence): string {
  return `${owner}\u0000${evidenceKey(item)}`;
}

/**
 * Owner key → excerpt id, from the latest served graph, so a resumed historical session can
 * offer "Show lines" for evidence the latest scan still has. A key that maps to two different
 * ids is ambiguous and dropped: the Studio never shows lines it cannot attribute.
 */
export function excerptIdsFrom(graph: Graph | null): Map<string, string> {
  const ids = new Map<string, string>();
  const conflicts = new Set<string>();
  const add = (owner: string, item: GraphEvidence): void => {
    if (item.excerptId === undefined) return;
    const key = excerptOwnerKey(owner, item);
    const known = ids.get(key);
    if (conflicts.has(key) || (known !== undefined && known !== item.excerptId)) {
      conflicts.add(key);
      ids.delete(key);
      return;
    }
    ids.set(key, item.excerptId);
  };
  for (const node of graph?.nodes ?? []) {
    for (const item of node.evidence) add(node.id, item);
    for (const property of node.properties ?? []) add(node.id, property.evidence);
  }
  for (const edge of graph?.edges ?? []) for (const item of edge.evidence) add(edge.id, item);
  return ids;
}
