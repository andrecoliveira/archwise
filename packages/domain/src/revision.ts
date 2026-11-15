import type {
  AnalyzerCoverage,
  Confidence,
  Diagnostic,
  DiagnosticReference,
  Evidence,
  GraphEdge,
  GraphNode,
  GraphRevision,
  Repository,
} from './graph.js';
import { compareCodeUnits } from './primitives.js';
import { validateRevision, type ValidationResult } from './validation.js';

const byId = (a: { readonly id: string }, b: { readonly id: string }): number =>
  compareCodeUnits(a.id, b.id);

const sortedStrings = (values: readonly string[]): string[] => [...values].sort(compareCodeUnits);

function copyConfidence(confidence: Confidence): Confidence {
  return { level: confidence.level, reasons: [...confidence.reasons] };
}

/** Copies only declared fields, in declared order, preserving the caller's collection order. */
function copyDeclared(revision: GraphRevision): GraphRevision {
  return {
    id: revision.id,
    workspaceId: revision.workspaceId,
    parentRevisionId: revision.parentRevisionId,
    createdAt: revision.createdAt,
    status: revision.status,
    repositories: revision.repositories.map((r): Repository => ({ id: r.id, label: r.label })),
    coverage: revision.coverage.map((c): AnalyzerCoverage => ({
      repositoryId: c.repositoryId,
      analyzerId: c.analyzerId,
      analyzerVersion: c.analyzerVersion,
      status: c.status,
    })),
    evidence: revision.evidence.map((e): Evidence => ({
      id: e.id,
      repositoryId: e.repositoryId,
      analyzerId: e.analyzerId,
      analyzerVersion: e.analyzerVersion,
      ruleId: e.ruleId,
      path: e.path,
      lines: e.lines === null ? null : { start: e.lines.start, end: e.lines.end },
    })),
    nodes: revision.nodes.map((n): GraphNode => ({
      id: n.id,
      kind: n.kind,
      label: n.label,
      repositoryId: n.repositoryId,
      confidence: copyConfidence(n.confidence),
      evidenceIds: [...n.evidenceIds],
    })),
    edges: revision.edges.map((e): GraphEdge => ({
      id: e.id,
      kind: e.kind,
      sourceId: e.sourceId,
      targetId: e.targetId,
      confidence: copyConfidence(e.confidence),
      evidenceIds: [...e.evidenceIds],
    })),
    diagnostics: revision.diagnostics.map((d): Diagnostic => ({
      id: d.id,
      severity: d.severity,
      code: d.code,
      references: d.references.map((r): DiagnosticReference => ({ kind: r.kind, id: r.id })),
    })),
  };
}

function compareCoverage(a: AnalyzerCoverage, b: AnalyzerCoverage): number {
  return (
    compareCodeUnits(a.repositoryId, b.repositoryId) ||
    compareCodeUnits(a.analyzerId, b.analyzerId) ||
    compareCodeUnits(a.analyzerVersion, b.analyzerVersion)
  );
}

function compareReferences(a: DiagnosticReference, b: DiagnosticReference): number {
  return compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.id, b.id);
}

/** Applies canonical ordering to a fresh copy. Never mutates its argument. */
function sortCopy(revision: GraphRevision): GraphRevision {
  const sortConfidence = (c: Confidence): Confidence => ({
    level: c.level,
    reasons: sortedStrings(c.reasons),
  });
  return {
    ...revision,
    repositories: [...revision.repositories].sort(byId),
    coverage: [...revision.coverage].sort(compareCoverage),
    evidence: [...revision.evidence].sort(byId),
    nodes: [...revision.nodes].sort(byId).map((n) => ({
      ...n,
      confidence: sortConfidence(n.confidence),
      evidenceIds: sortedStrings(n.evidenceIds),
    })),
    edges: [...revision.edges].sort(byId).map((e) => ({
      ...e,
      confidence: sortConfidence(e.confidence),
      evidenceIds: sortedStrings(e.evidenceIds),
    })),
    diagnostics: [...revision.diagnostics]
      .sort(byId)
      .map((d) => ({ ...d, references: [...d.references].sort(compareReferences) })),
  };
}

/** Fresh copy with declared fields only and canonical ordering (records by ID, sets by code unit). */
export function canonicalizeRevision(revision: GraphRevision): GraphRevision {
  return sortCopy(copyDeclared(revision));
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

/**
 * Copies caller-owned data, validates the copy (issue paths refer to the caller's order),
 * then returns a canonical, recursively frozen revision. Nothing is returned on failure.
 */
export function createRevision(input: GraphRevision): ValidationResult<GraphRevision> {
  const copy = copyDeclared(input);
  const issues = validateRevision(copy);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: deepFreeze(sortCopy(copy)) };
}
