/*
 * View graph v2 as served by `/api/v1/graph` (browser-side copy of the CLI contract; the web
 * app never imports server packages). Version 1 graphs, which Phase 3 sessions stored, are
 * converted on read by `upgradeGraph`.
 */

export const NODE_TYPES = [
  'frontend',
  'service',
  'module',
  'datastore',
  'queue',
  'external-system',
  'job',
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const EDGE_TYPES = [
  'depends-on',
  'calls',
  'publishes',
  'consumes',
  'reads',
  'writes',
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export const GAP_REASONS = [
  'unsupported',
  'invalid-syntax',
  'too-large',
  'binary',
  'unreadable',
  'budget',
  'unmatched-build-context',
  'unidentified-datastore',
] as const;
export type GapReason = (typeof GAP_REASONS)[number];

export type Confidence = 'observed' | 'inferred';

export interface GraphEvidence {
  readonly path: string;
  readonly kind: string;
  readonly lines: { readonly start: number; readonly end: number } | null;
  readonly analyzer: string;
  /** Served graphs only: the latest scan's key for "Show lines" (ADR 0008). */
  readonly excerptId?: string;
}

/** An allowlisted Compose value, masked, with the evidence that states it. */
export interface GraphProperty {
  readonly name: string;
  readonly value: string;
  readonly evidence: GraphEvidence;
}

export interface GraphNode {
  readonly id: string;
  readonly type: NodeType;
  readonly label: string;
  readonly technology: string | null;
  readonly confidence: Confidence;
  readonly reasons: readonly string[];
  readonly outsideWorkspace: boolean;
  /** Compose service names linked to a package. */
  readonly aliases: readonly string[];
  readonly origin: 'discovered';
  readonly evidence: readonly GraphEvidence[];
  /** The owning repository; present only in multi-root workspaces. */
  readonly repository?: { readonly id: string; readonly label: string };
  /** External systems only: what it is for (`payments`, `email`, …). */
  readonly category?: string;
  readonly properties?: readonly GraphProperty[];
}

export interface GraphEdge {
  readonly id: string;
  readonly type: EdgeType;
  readonly source: string;
  readonly target: string;
  readonly confidence: Confidence;
  readonly reasons: readonly string[];
  readonly origin: 'discovered';
  readonly evidence: readonly GraphEvidence[];
}

export interface GraphGap {
  readonly path: string;
  readonly analyzer: string;
  readonly reason: GapReason;
}

export interface Graph {
  readonly version: 2;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly string[];
  readonly gaps: readonly GraphGap[];
  readonly inspectedEntries: number;
}

const KIND_LABELS: Readonly<Record<NodeType, string>> = {
  frontend: 'Frontend',
  service: 'Service',
  module: 'Library',
  datastore: 'Datastore',
  queue: 'Queue',
  'external-system': 'External service',
  job: 'Job',
};

export function kindLabel(type: NodeType): string {
  return KIND_LABELS[type];
}

type Shape = Record<string, unknown>;

function isRecord(value: unknown): value is Shape {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const isString = (value: unknown): value is string => typeof value === 'string';
const isStrings = (value: unknown): boolean => Array.isArray(value) && value.every(isString);
const oneOf = (value: unknown, options: readonly string[]): boolean =>
  typeof value === 'string' && options.includes(value);
const isConfidence = (value: unknown): boolean => value === 'observed' || value === 'inferred';
const isCount = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isLines(value: unknown): boolean {
  return (
    value === null ||
    (isRecord(value) && typeof value.start === 'number' && typeof value.end === 'number')
  );
}

function isEvidence(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.path) &&
    isString(value.kind) &&
    isLines(value.lines) &&
    isString(value.analyzer) &&
    (value.excerptId === undefined || isString(value.excerptId))
  );
}

function isProperty(value: unknown): boolean {
  return (
    isRecord(value) && isString(value.name) && isString(value.value) && isEvidence(value.evidence)
  );
}

function isRepository(value: unknown): boolean {
  return value === undefined || (isRecord(value) && isString(value.id) && isString(value.label));
}

function isNode(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    oneOf(value.type, NODE_TYPES) &&
    isString(value.label) &&
    (value.technology === null || isString(value.technology)) &&
    isConfidence(value.confidence) &&
    isStrings(value.reasons) &&
    typeof value.outsideWorkspace === 'boolean' &&
    isStrings(value.aliases) &&
    value.origin === 'discovered' &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidence) &&
    isRepository(value.repository) &&
    (value.category === undefined || isString(value.category)) &&
    (value.properties === undefined ||
      (Array.isArray(value.properties) && value.properties.every(isProperty)))
  );
}

function isEdge(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.id) &&
    oneOf(value.type, EDGE_TYPES) &&
    isString(value.source) &&
    isString(value.target) &&
    isConfidence(value.confidence) &&
    isStrings(value.reasons) &&
    value.origin === 'discovered' &&
    Array.isArray(value.evidence) &&
    value.evidence.every(isEvidence)
  );
}

function isGap(value: unknown): boolean {
  return (
    isRecord(value) &&
    isString(value.path) &&
    isString(value.analyzer) &&
    oneOf(value.reason, GAP_REASONS)
  );
}

/** Validate external JSON as unknown before the browser consumes it (version 2 only). */
export function isGraph(value: unknown): value is Graph {
  return (
    isRecord(value) &&
    value.version === 2 &&
    Array.isArray(value.nodes) &&
    value.nodes.every(isNode) &&
    Array.isArray(value.edges) &&
    value.edges.every(isEdge) &&
    isStrings(value.diagnostics) &&
    Array.isArray(value.gaps) &&
    value.gaps.every(isGap) &&
    isCount(value.inspectedEntries)
  );
}

function isV1Evidence(value: unknown): value is { path: string; kind: string } {
  return isRecord(value) && isString(value.path) && isString(value.kind);
}

const upgradeEvidence = (items: unknown[]): GraphEvidence[] =>
  items.filter(isV1Evidence).map(({ path, kind }) => ({
    path,
    kind,
    lines: null,
    analyzer: 'node-manifest',
  }));

/** A v1 graph (Phase 3 sessions) converted to v2 with identical IDs, or null when invalid. */
function upgradeV1(value: Shape): Graph | null {
  const { nodes, edges, diagnostics, inspectedEntries } = value;
  if (!Array.isArray(nodes) || !Array.isArray(edges) || !isStrings(diagnostics)) return null;
  if (!isCount(inspectedEntries)) return null;
  const upgradedNodes: GraphNode[] = [];
  for (const node of nodes as unknown[]) {
    if (
      !isRecord(node) ||
      !isString(node.id) ||
      !isString(node.label) ||
      !(node.framework === null || isString(node.framework)) ||
      !Array.isArray(node.evidence) ||
      !node.evidence.every(isV1Evidence) ||
      !isRepository(node.repository)
    ) {
      return null;
    }
    upgradedNodes.push({
      id: node.id,
      type: 'module',
      label: node.label,
      technology: node.framework,
      confidence: 'observed',
      reasons: ['manifest-declared'],
      outsideWorkspace: false,
      aliases: [],
      origin: 'discovered',
      evidence: upgradeEvidence(node.evidence),
      ...(node.repository === undefined
        ? {}
        : { repository: node.repository as { id: string; label: string } }),
    });
  }
  const upgradedEdges: GraphEdge[] = [];
  for (const edge of edges as unknown[]) {
    if (
      !isRecord(edge) ||
      !isString(edge.id) ||
      !isString(edge.source) ||
      !isString(edge.target) ||
      !Array.isArray(edge.evidence) ||
      !edge.evidence.every(isV1Evidence)
    ) {
      return null;
    }
    upgradedEdges.push({
      id: edge.id,
      type: 'depends-on',
      source: edge.source,
      target: edge.target,
      confidence: 'observed',
      reasons: ['dependency-declared'],
      origin: 'discovered',
      evidence: upgradeEvidence(edge.evidence),
    });
  }
  return {
    version: 2,
    nodes: upgradedNodes,
    edges: upgradedEdges,
    diagnostics: diagnostics as string[],
    gaps: [],
    inspectedEntries: inspectedEntries as number,
  };
}

/** A v2 graph as-is, a v1 graph converted with identical IDs, otherwise null. */
export function upgradeGraph(value: unknown): Graph | null {
  if (isGraph(value)) return value;
  if (isRecord(value) && value.version === 1) return upgradeV1(value);
  return null;
}
