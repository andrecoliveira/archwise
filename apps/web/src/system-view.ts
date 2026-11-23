import type { Graph, GraphEdge, GraphNode } from './graph-types.js';

export type StudioView = 'system' | 'all';

const visible = (node: GraphNode): boolean => node.type !== 'module' && !node.outsideWorkspace;
const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * The System view: frontends, services and infrastructure, without libraries (modules) or
 * packages outside the workspace. A hidden library's edges are lifted to every visible node
 * that depends on it, directly or through other hidden libraries, as inferred edges whose
 * reason names the libraries in between. A direct edge always wins over a lifted one.
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
  const lifted = new Map<string, GraphEdge>();
  for (const source of [...shown].sort()) {
    const seen = new Set<string>([source]);
    const walk = (from: string, via: readonly string[]): void => {
      for (const edge of outgoing.get(from) ?? []) {
        const target = edge.target;
        if (from === source && shown.has(target)) continue;
        if (shown.has(target)) {
          const key = `${source}\u0000${target}`;
          if (target === source || direct.has(key) || lifted.has(key)) continue;
          lifted.set(key, {
            id: `lifted:${source}->${target}`,
            type: edge.type,
            source,
            target,
            confidence: 'inferred',
            reasons: [`via ${via.join(', ')}`],
            origin: 'discovered',
            evidence: edge.evidence,
          });
        } else if (!seen.has(target) && nodes.has(target)) {
          seen.add(target);
          walk(target, [...via, nodes.get(target)!.label]);
        }
      }
    };
    walk(source, []);
  }
  return {
    ...graph,
    nodes: graph.nodes.filter(visible),
    edges: [...kept, ...lifted.values()].sort(byId),
  };
}

export function initialView(graph: Graph): StudioView {
  return systemGraph(graph).nodes.length === 0 ? 'all' : 'system';
}

export function graphForView(graph: Graph, view: StudioView): Graph {
  return view === 'all' ? graph : systemGraph(graph);
}
