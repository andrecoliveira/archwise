import type { Graph, GraphEdge, GraphNode } from './graph-types.js';

/** Test helpers: a discovered v2 node or edge with sensible defaults. */
export function discoveredNode(id: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    type: 'module',
    label: id,
    technology: null,
    confidence: 'observed',
    reasons: ['manifest-declared'],
    outsideWorkspace: false,
    aliases: [],
    origin: 'discovered',
    evidence: [
      { path: 'package.json', kind: 'package-manifest', lines: null, analyzer: 'node-manifest' },
    ],
    ...overrides,
  };
}

export function discoveredEdge(
  source: string,
  target: string,
  overrides: Partial<GraphEdge> = {},
): GraphEdge {
  return {
    id: `depends-on:${source}->${target}`,
    type: 'depends-on',
    source,
    target,
    confidence: 'observed',
    reasons: ['dependency-declared'],
    origin: 'discovered',
    evidence: [
      { path: 'package.json', kind: 'package-dependency', lines: null, analyzer: 'node-manifest' },
    ],
    ...overrides,
  };
}

export function graphOf(
  nodes: GraphNode[],
  edges: GraphEdge[] = [],
  overrides: Partial<Graph> = {},
): Graph {
  return {
    version: 2,
    nodes,
    edges,
    diagnostics: [],
    gaps: [],
    inspectedEntries: nodes.length,
    ...overrides,
  };
}
