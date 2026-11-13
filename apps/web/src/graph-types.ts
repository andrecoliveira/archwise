export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly framework: string | null;
  readonly origin: 'discovered';
  readonly evidence: readonly { readonly path: string; readonly kind: string }[];
}
export interface GraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly origin: 'discovered';
  readonly evidence: readonly { readonly path: string; readonly kind: string }[];
}
export interface Graph {
  readonly version: 1;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly string[];
  readonly inspectedEntries: number;
}
export function isGraph(value: unknown): value is Graph {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const graph = value as Partial<Graph>;
  return graph.version === 1 &&
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    Array.isArray(graph.diagnostics) &&
    typeof graph.inspectedEntries === 'number' &&
    graph.nodes.every((node) => typeof node.id === 'string' &&
      typeof node.label === 'string' && Array.isArray(node.evidence)) &&
    graph.edges.every((edge) =>
      typeof edge.id === 'string' &&
      typeof edge.source === 'string' &&
      typeof edge.target === 'string');
}
