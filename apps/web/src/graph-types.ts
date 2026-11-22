export interface GraphNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly framework: string | null;
  readonly origin: 'discovered';
  readonly evidence: readonly { readonly path: string; readonly kind: string }[];
  /** The owning repository; present only in multi-root workspaces. */
  readonly repository?: { readonly id: string; readonly label: string };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isEvidence(value: unknown): boolean {
  return isRecord(value) && typeof value.path === 'string' && typeof value.kind === 'string';
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.type === 'string' &&
    (value.framework === null || typeof value.framework === 'string') &&
    value.origin === 'discovered' &&
    Array.isArray(value.evidence) &&
    value.evidence.every((item: unknown) => isEvidence(item)) &&
    (value.repository === undefined ||
      (isRecord(value.repository) &&
        typeof value.repository.id === 'string' &&
        typeof value.repository.label === 'string'))
  );
}

function isEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.source === 'string' &&
    typeof value.target === 'string' &&
    typeof value.type === 'string' &&
    value.origin === 'discovered' &&
    Array.isArray(value.evidence) &&
    value.evidence.every((item: unknown) => isEvidence(item))
  );
}

/** Validate external JSON as unknown before the browser consumes it. */
export function isGraph(value: unknown): value is Graph {
  return (
    isRecord(value) &&
    value.version === 1 &&
    Array.isArray(value.nodes) &&
    value.nodes.every((item: unknown) => isNode(item)) &&
    Array.isArray(value.edges) &&
    value.edges.every((item: unknown) => isEdge(item)) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every((item: unknown) => typeof item === 'string') &&
    typeof value.inspectedEntries === 'number' &&
    Number.isFinite(value.inspectedEntries) &&
    value.inspectedEntries >= 0
  );
}
