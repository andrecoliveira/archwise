import type { Graph, GraphNode } from './graph-types.js';
import type { ScanNotesView } from './scan-notes.js';

/*
 * Counters (spec §5.9): each states its unit and its confidence split, and each count is a
 * filter. Filters only dim (spec §5.10); they never add colour.
 */

export type Filter = 'inferred-components' | 'inferred-relations';

export interface CounterView {
  readonly components: { readonly total: number; readonly inferred: number };
  readonly relations: { readonly total: number; readonly inferred: number };
  readonly files: number;
  readonly notes: number;
}

export function countersFor(view: Graph, notes: ScanNotesView): CounterView {
  return {
    components: {
      total: view.nodes.length,
      inferred: view.nodes.filter((node) => node.confidence !== 'observed').length,
    },
    relations: {
      total: view.edges.length,
      inferred: view.edges.filter((edge) => edge.confidence !== 'observed').length,
    },
    files: new Set(notes.gaps.map((gap) => gap.path)).size,
    notes: notes.notes.length,
  };
}

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export const totalLabel = (count: number, unit: 'component' | 'relation'): string =>
  plural(count, unit, `${unit}s`);

export function scanLabel(c: CounterView): string | null {
  const parts = [
    c.files > 0 ? plural(c.files, 'file not analyzed', 'files not analyzed') : null,
    c.notes > 0 ? plural(c.notes, 'note', 'notes') : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function counterLabels(c: CounterView): {
  components: string;
  relations: string;
  scan: string | null;
} {
  const split = (total: string, inferred: number): string =>
    inferred > 0 ? `${total} · ${inferred} inferred` : total;
  return {
    components: split(totalLabel(c.components.total, 'component'), c.components.inferred),
    relations: split(totalLabel(c.relations.total, 'relation'), c.relations.inferred),
    scan: scanLabel(c),
  };
}

/** The libraries the System view hides, by name. */
export function hiddenLibraries(full: Graph): GraphNode[] {
  return full.nodes
    .filter((node) => node.type === 'module')
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}
