import type { GapReason, Graph } from './graph-types.js';

/*
 * Scan notes: the files Archwise saw but did not analyze (coverage gaps), each with its reason
 * in words, followed by every other scan diagnostic. Nothing the scan reported is dropped.
 */

export const GAP_REASON_TEXT: Readonly<Record<GapReason, string>> = {
  unsupported: 'not supported yet',
  'invalid-syntax': 'invalid syntax',
  'too-large': 'too large to analyze',
  binary: 'binary file',
  unreadable: 'could not be read',
  budget: 'the analyzer ran out of budget',
  'unmatched-build-context': 'its Compose build context matches no package',
  'unidentified-datastore': 'its datastore technology was not identified',
};

export interface ScanNotesView {
  readonly gaps: { readonly path: string; readonly reason: string }[];
  readonly notes: string[];
  readonly headline: string;
}

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export function scanNotes(graph: Graph): ScanNotesView {
  const seen = new Set<string>();
  const gaps = graph.gaps
    .map((gap) => ({ path: gap.path, reason: GAP_REASON_TEXT[gap.reason] ?? gap.reason }))
    .filter(({ path, reason }) => {
      const key = `${path}\u0000${reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compare(a.path, b.path) || compare(a.reason, b.reason));
  const files = new Set(gaps.map((gap) => gap.path)).size;
  const notes = [...graph.diagnostics];
  const parts = [
    files > 0 ? plural(files, 'file not analyzed', 'files not analyzed') : null,
    notes.length > 0 ? plural(notes.length, 'note', 'notes') : null,
  ].filter((part): part is string => part !== null);
  return { gaps, notes, headline: parts.length > 0 ? parts.join(' · ') : 'Nothing to report' };
}
