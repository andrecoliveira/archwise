/** Portable graph revision vocabulary (format `archwise.graph`, version 1). */

export const GRAPH_FORMAT = 'archwise.graph';
export const GRAPH_VERSION = 1;

export const NODE_KINDS = [
  'system',
  'repository',
  'service',
  'module',
  'api',
  'job',
  'queue',
  'topic',
  'datastore',
  'external-system',
  'deployment-unit',
] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const EDGE_KINDS = [
  'contains',
  'depends-on',
  'calls',
  'publishes',
  'consumes',
  'reads',
  'writes',
  'deploys-to',
  'exposes',
] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];

export const CONFIDENCE_LEVELS = ['observed', 'inferred', 'unknown'] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const COVERAGE_STATUSES = ['complete', 'partial', 'failed', 'unsupported'] as const;
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number];

export const REVISION_STATUSES = ['complete', 'partial'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const DIAGNOSTIC_SEVERITIES = ['info', 'warning', 'error'] as const;
export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number];

export const DIAGNOSTIC_REFERENCE_KINDS = ['repository', 'node', 'edge', 'evidence'] as const;
export type DiagnosticReferenceKind = (typeof DIAGNOSTIC_REFERENCE_KINDS)[number];

export interface Confidence {
  readonly level: ConfidenceLevel;
  readonly reasons: readonly string[];
}

export interface Repository {
  readonly id: string;
  readonly label: string;
}

export interface LineRange {
  readonly start: number;
  readonly end: number;
}

export interface Evidence {
  readonly id: string;
  readonly repositoryId: string;
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly ruleId: string;
  readonly path: string;
  readonly lines: LineRange | null;
}

export interface AnalyzerCoverage {
  readonly repositoryId: string;
  readonly analyzerId: string;
  readonly analyzerVersion: string;
  readonly status: CoverageStatus;
}

export interface GraphNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly label: string;
  readonly repositoryId: string | null;
  readonly confidence: Confidence;
  readonly evidenceIds: readonly string[];
}

export interface GraphEdge {
  readonly id: string;
  readonly kind: EdgeKind;
  readonly sourceId: string;
  readonly targetId: string;
  readonly confidence: Confidence;
  readonly evidenceIds: readonly string[];
}

export interface DiagnosticReference {
  readonly kind: DiagnosticReferenceKind;
  readonly id: string;
}

export interface Diagnostic {
  readonly id: string;
  readonly severity: DiagnosticSeverity;
  readonly code: string;
  readonly references: readonly DiagnosticReference[];
}

export interface GraphRevision {
  readonly id: string;
  readonly workspaceId: string;
  readonly parentRevisionId: string | null;
  readonly createdAt: string;
  readonly status: RevisionStatus;
  readonly repositories: readonly Repository[];
  readonly coverage: readonly AnalyzerCoverage[];
  readonly evidence: readonly Evidence[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly Diagnostic[];
}

/** Initial safety ceilings, not performance promises. */
export const LIMITS = {
  importBytes: 16_777_216,
  collection: 10_000,
  references: 1_000,
  label: 256,
  path: 1_024,
} as const;
