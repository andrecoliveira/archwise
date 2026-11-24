import type { Graph, GraphEdge, GraphNode } from './graph-types.js';
import { evidenceKey } from './reason-catalog.js';

export type StudioView = 'system' | 'all';

const visible = (node: GraphNode): boolean => node.type !== 'module' && !node.outsideWorkspace;
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

export const MAX_OTHER_CHAINS = 20;
export const MAX_EXPANSIONS_PER_SOURCE = 5000;

interface Chain {
  readonly steps: readonly GraphEdge[];
  readonly inferred: number;
  /** Deterministic tiebreak: the step ids joined. */
  readonly key: string;
}

const extend = (chain: Chain, edge: GraphEdge): Chain => ({
  steps: [...chain.steps, edge],
  inferred: chain.inferred + (edge.confidence === 'observed' ? 0 : 1),
  key: `${chain.key}\u0000${edge.id}`,
});

/** Fewer inferred steps first, then fewer steps, then step ids. */
const stronger = (a: Chain, b: Chain): number =>
  a.inferred - b.inferred ||
  a.steps.length - b.steps.length ||
  (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** A minimal binary min-heap over chains, ordered by `stronger`. */
class ChainHeap {
  private readonly items: [string, Chain][] = [];
  get size(): number {
    return this.items.length;
  }
  push(item: [string, Chain]): void {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (stronger(items[i]![1], items[parent]![1]) >= 0) break;
      [items[i], items[parent]] = [items[parent]!, items[i]!];
      i = parent;
    }
  }
  pop(): [string, Chain] {
    const items = this.items;
    const top = items[0]!;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && stronger(items[left]![1], items[smallest]![1]) < 0)
          smallest = left;
        if (right < items.length && stronger(items[right]![1], items[smallest]![1]) < 0)
          smallest = right;
        if (smallest === i) break;
        [items[i], items[smallest]] = [items[smallest]!, items[i]!];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * The System view: frontends, services and infrastructure, without libraries (modules) or
 * packages outside the workspace. A relation that runs through hidden libraries becomes an
 * Indirect relation (spec §5.8): it keeps the strongest chain of steps, lists the others, takes
 * the weakest step's confidence and the union of the steps' evidence. A direct relation always
 * wins over an indirect one.
 */
export function systemGraph(graph: Graph): Graph {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const shown = new Set(graph.nodes.filter(visible).map((node) => node.id));
  const outgoing = new Map<string, GraphEdge[]>();
  for (const edge of [...graph.edges].sort(byId)) {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge]);
  }
  const kept = graph.edges.filter((edge) => shown.has(edge.source) && shown.has(edge.target));
  const direct = new Set(kept.map((edge) => `${edge.source}\u0000${edge.target}`));
  const hidden = (id: string): boolean => nodes.has(id) && !shown.has(id);
  const labelsOf = (chain: Chain): string[] =>
    chain.steps.slice(0, -1).map((step) => nodes.get(step.target)!.label);
  const indirect: GraphEdge[] = [];
  for (const source of [...shown].sort()) {
    // Strongest chain to each hidden library, then to each visible target (Dijkstra on cost).
    const best = new Map<string, Chain>();
    const frontier = new ChainHeap();
    for (const edge of outgoing.get(source) ?? []) {
      if (hidden(edge.target))
        frontier.push([edge.target, extend({ steps: [], inferred: 0, key: '' }, edge)]);
    }
    const targets = new Map<string, Chain>();
    while (frontier.size > 0) {
      const [at, chain] = frontier.pop();
      if (best.has(at)) continue;
      best.set(at, chain);
      for (const edge of outgoing.get(at) ?? []) {
        const next = extend(chain, edge);
        if (hidden(edge.target)) {
          if (!best.has(edge.target)) frontier.push([edge.target, next]);
        } else if (shown.has(edge.target) && edge.target !== source) {
          const current = targets.get(edge.target);
          if (!current || stronger(next, current) < 0) targets.set(edge.target, next);
        }
      }
    }
    if (targets.size === 0) continue;
    // Other chains, for "Also through …": bounded depth-first enumeration.
    const others = new Map<string, Map<string, string[]>>();
    let expansions = 0;
    const walk = (at: string, through: string[], seen: Set<string>): void => {
      for (const edge of outgoing.get(at) ?? []) {
        if (++expansions > MAX_EXPANSIONS_PER_SOURCE) return;
        if (hidden(edge.target)) {
          if (seen.has(edge.target)) continue;
          seen.add(edge.target);
          walk(edge.target, [...through, nodes.get(edge.target)!.label], seen);
          seen.delete(edge.target);
        } else if (targets.has(edge.target) && through.length > 0) {
          const found = others.get(edge.target) ?? new Map<string, string[]>();
          found.set(through.join('\u0000'), through);
          others.set(edge.target, found);
        }
      }
    };
    for (const edge of outgoing.get(source) ?? []) {
      if (hidden(edge.target))
        walk(edge.target, [nodes.get(edge.target)!.label], new Set([edge.target]));
    }
    for (const [target, chain] of targets) {
      if (direct.has(`${source}\u0000${target}`)) continue;
      const through = labelsOf(chain);
      const used = through.join('\u0000');
      const alternatives = [...(others.get(target) ?? new Map<string, string[]>())]
        .filter(([key]) => key !== used)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .slice(0, MAX_OTHER_CHAINS)
        .map(([, list]) => list);
      const seenEvidence = new Set<string>();
      const evidence = chain.steps
        .flatMap((step) => step.evidence)
        .filter((item) => {
          const key = evidenceKey(item);
          if (seenEvidence.has(key)) return false;
          seenEvidence.add(key);
          return true;
        });
      indirect.push({
        id: `indirect:${source}->${target}`,
        type: chain.steps[chain.steps.length - 1]!.type,
        source,
        target,
        confidence: chain.inferred === 0 ? 'observed' : 'inferred',
        reasons: [],
        origin: 'discovered',
        evidence,
        indirect: { steps: chain.steps, through, others: alternatives },
      });
    }
  }
  return {
    ...graph,
    nodes: graph.nodes.filter(visible),
    edges: [...kept, ...indirect].sort(byId),
  };
}

export function initialView(graph: Graph): StudioView {
  return systemGraph(graph).nodes.length === 0 ? 'all' : 'system';
}

export function graphForView(graph: Graph, view: StudioView): Graph {
  return view === 'all' ? graph : systemGraph(graph);
}

/**
 * True when the Studio should say nothing was recognized: a current scan with packages but no
 * frontends, services or infrastructure. A resumed session's stored view may predate the
 * analyzers, and the "architecture changed" notice already explains it.
 */
export function showsNothingRecognized(graph: Graph, historical: boolean): boolean {
  return !historical && graph.nodes.length > 0 && initialView(graph) === 'all';
}
