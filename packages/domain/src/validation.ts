import {
  CONFIDENCE_LEVELS,
  COVERAGE_STATUSES,
  DIAGNOSTIC_REFERENCE_KINDS,
  DIAGNOSTIC_SEVERITIES,
  EDGE_KINDS,
  LIMITS,
  NODE_KINDS,
  REVISION_STATUSES,
  type Confidence,
  type GraphRevision,
} from './graph.js';
import {
  checkRelativePath,
  containsHomePath,
  containsSecretPattern,
  isValidCode,
  isValidId,
  isValidLabel,
  isValidTimestamp,
} from './primitives.js';

export type ValidationErrorCode =
  | 'invalid-id'
  | 'duplicate-id'
  | 'dangling-reference'
  | 'missing-evidence'
  | 'invalid-confidence'
  | 'invalid-code'
  | 'invalid-value'
  | 'invalid-label'
  | 'invalid-timestamp'
  | 'invalid-line-range'
  | 'unsafe-path'
  | 'secret-pattern'
  | 'home-path'
  | 'limit-exceeded'
  | 'containment-cycle'
  | 'self-containment'
  | 'parent-is-self'
  | 'incomplete-coverage'
  | 'duplicate-coverage'
  | 'duplicate-reference';

export type IssuePath = readonly (string | number)[];

/** A stable code plus the structural location. Rejected values are never echoed. */
export interface ValidationIssue {
  readonly code: string;
  readonly path: IssuePath;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

class IssueCollector {
  readonly issues: ValidationIssue[] = [];

  add(code: ValidationErrorCode, path: IssuePath): void {
    this.issues.push({ code, path });
  }

  /** Validates an identifier, including known secret shapes that would otherwise match the ID pattern. */
  id(value: string, path: IssuePath): boolean {
    if (!isValidId(value)) {
      this.add('invalid-id', path);
      return false;
    }
    if (containsSecretPattern(value)) {
      this.add('secret-pattern', path);
      return false;
    }
    return true;
  }

  reference(value: string, targets: ReadonlySet<string>, path: IssuePath): void {
    if (this.id(value, path) && !targets.has(value)) this.add('dangling-reference', path);
  }

  label(value: string, path: IssuePath): void {
    if (!isValidLabel(value)) this.add('invalid-label', path);
    else if (containsSecretPattern(value)) this.add('secret-pattern', path);
    else if (containsHomePath(value)) this.add('home-path', path);
  }

  code(value: string, path: IssuePath): void {
    if (!isValidCode(value)) this.add('invalid-code', path);
    else if (containsSecretPattern(value)) this.add('secret-pattern', path);
  }

  /** Enum membership, so untyped callers get an issue instead of an exception or silent acceptance. */
  oneOf(value: string, allowed: readonly string[], path: IssuePath): boolean {
    if (allowed.includes(value)) return true;
    this.add('invalid-value', path);
    return false;
  }

  limit(length: number, max: number, path: IssuePath): void {
    if (length > max) this.add('limit-exceeded', path);
  }

  /** Records each record ID and reports repeats at the later occurrence. */
  uniqueIds(records: readonly { readonly id: string }[], collection: string): Set<string> {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      const path = [collection, index, 'id'];
      if (!this.id(record.id, path)) return;
      if (seen.has(record.id)) this.add('duplicate-id', path);
      seen.add(record.id);
    });
    return seen;
  }

  duplicates(values: readonly string[], path: IssuePath): void {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) this.add('duplicate-reference', [...path, index]);
      seen.add(value);
    });
  }

  evidenceIds(ids: readonly string[], evidence: ReadonlySet<string>, path: IssuePath): void {
    if (ids.length === 0) this.add('missing-evidence', path);
    this.limit(ids.length, LIMITS.references, path);
    ids.forEach((id, index) => this.reference(id, evidence, [...path, index]));
    this.duplicates(ids, path);
  }

  confidence(confidence: Confidence, path: IssuePath): void {
    this.oneOf(confidence.level, CONFIDENCE_LEVELS, [...path, 'level']);
    const reasonsPath = [...path, 'reasons'];
    if (confidence.reasons.length === 0) this.add('invalid-confidence', reasonsPath);
    this.limit(confidence.reasons.length, LIMITS.references, reasonsPath);
    confidence.reasons.forEach((reason, index) => this.code(reason, [...reasonsPath, index]));
    this.duplicates(confidence.reasons, reasonsPath);
  }
}

/** Pure semantic validation. Returns an empty list for a valid revision. */
export function validateRevision(revision: GraphRevision): readonly ValidationIssue[] {
  const check = new IssueCollector();

  check.id(revision.id, ['id']);
  check.id(revision.workspaceId, ['workspaceId']);
  if (revision.parentRevisionId !== null) {
    check.id(revision.parentRevisionId, ['parentRevisionId']);
    if (revision.parentRevisionId === revision.id)
      check.add('parent-is-self', ['parentRevisionId']);
  }
  if (!isValidTimestamp(revision.createdAt)) check.add('invalid-timestamp', ['createdAt']);
  check.oneOf(revision.status, REVISION_STATUSES, ['status']);

  for (const name of [
    'repositories',
    'coverage',
    'evidence',
    'nodes',
    'edges',
    'diagnostics',
  ] as const) {
    check.limit(revision[name].length, LIMITS.collection, [name]);
  }

  const repositories = check.uniqueIds(revision.repositories, 'repositories');
  revision.repositories.forEach((repository, index) => {
    check.label(repository.label, ['repositories', index, 'label']);
  });

  const coverageKeys = new Set<string>();
  revision.coverage.forEach((coverage, index) => {
    const path = ['coverage', index];
    check.reference(coverage.repositoryId, repositories, [...path, 'repositoryId']);
    check.id(coverage.analyzerId, [...path, 'analyzerId']);
    check.id(coverage.analyzerVersion, [...path, 'analyzerVersion']);
    check.oneOf(coverage.status, COVERAGE_STATUSES, [...path, 'status']);
    const key = `${coverage.repositoryId}\u0000${coverage.analyzerId}\u0000${coverage.analyzerVersion}`;
    if (coverageKeys.has(key)) check.add('duplicate-coverage', path);
    coverageKeys.add(key);
    if (
      revision.status === 'complete' &&
      (coverage.status === 'partial' || coverage.status === 'failed')
    ) {
      check.add('incomplete-coverage', [...path, 'status']);
    }
  });

  const evidence = check.uniqueIds(revision.evidence, 'evidence');
  revision.evidence.forEach((record, index) => {
    const path = ['evidence', index];
    check.reference(record.repositoryId, repositories, [...path, 'repositoryId']);
    check.id(record.analyzerId, [...path, 'analyzerId']);
    check.id(record.analyzerVersion, [...path, 'analyzerVersion']);
    check.id(record.ruleId, [...path, 'ruleId']);
    if (checkRelativePath(record.path) !== null) check.add('unsafe-path', [...path, 'path']);
    else if (containsSecretPattern(record.path)) check.add('secret-pattern', [...path, 'path']);
    const lines = record.lines;
    if (
      lines !== null &&
      !(
        Number.isSafeInteger(lines.start) &&
        Number.isSafeInteger(lines.end) &&
        lines.start >= 1 &&
        lines.end >= lines.start
      )
    ) {
      check.add('invalid-line-range', [...path, 'lines']);
    }
  });

  const nodes = check.uniqueIds(revision.nodes, 'nodes');
  revision.nodes.forEach((node, index) => {
    const path = ['nodes', index];
    check.oneOf(node.kind, NODE_KINDS, [...path, 'kind']);
    check.label(node.label, [...path, 'label']);
    if (node.repositoryId !== null) {
      check.reference(node.repositoryId, repositories, [...path, 'repositoryId']);
    }
    check.confidence(node.confidence, [...path, 'confidence']);
    check.evidenceIds(node.evidenceIds, evidence, [...path, 'evidenceIds']);
  });

  const edges = check.uniqueIds(revision.edges, 'edges');
  revision.edges.forEach((edge, index) => {
    const path = ['edges', index];
    check.oneOf(edge.kind, EDGE_KINDS, [...path, 'kind']);
    check.reference(edge.sourceId, nodes, [...path, 'sourceId']);
    check.reference(edge.targetId, nodes, [...path, 'targetId']);
    check.confidence(edge.confidence, [...path, 'confidence']);
    check.evidenceIds(edge.evidenceIds, evidence, [...path, 'evidenceIds']);
    if (edge.kind === 'contains' && edge.sourceId === edge.targetId) {
      check.add('self-containment', path);
    }
  });
  const cycleEdge = findContainmentCycle(revision);
  if (cycleEdge !== null) check.add('containment-cycle', ['edges', cycleEdge]);

  check.uniqueIds(revision.diagnostics, 'diagnostics');
  const targets = { repository: repositories, node: nodes, edge: edges, evidence } as const;
  revision.diagnostics.forEach((diagnostic, index) => {
    const path = ['diagnostics', index];
    check.oneOf(diagnostic.severity, DIAGNOSTIC_SEVERITIES, [...path, 'severity']);
    check.code(diagnostic.code, [...path, 'code']);
    const referencesPath = [...path, 'references'];
    check.limit(diagnostic.references.length, LIMITS.references, referencesPath);
    const seen = new Set<string>();
    diagnostic.references.forEach((reference, referenceIndex) => {
      const referencePath = [...referencesPath, referenceIndex];
      if (check.oneOf(reference.kind, DIAGNOSTIC_REFERENCE_KINDS, [...referencePath, 'kind'])) {
        check.reference(reference.id, targets[reference.kind], [...referencePath, 'id']);
      }
      const key = `${reference.kind}\u0000${reference.id}`;
      if (seen.has(key)) check.add('duplicate-reference', referencePath);
      seen.add(key);
    });
  });

  return check.issues;
}

/**
 * Returns the index of an edge that closes a cycle among `contains` edges, or null.
 * Iterative depth-first search so large containment chains cannot overflow the stack.
 */
function findContainmentCycle(revision: GraphRevision): number | null {
  const children = new Map<string, { target: string; edgeIndex: number }[]>();
  revision.edges.forEach((edge, edgeIndex) => {
    if (edge.kind !== 'contains' || edge.sourceId === edge.targetId) return;
    const list = children.get(edge.sourceId) ?? [];
    list.push({ target: edge.targetId, edgeIndex });
    children.set(edge.sourceId, list);
  });

  const state = new Map<string, 'active' | 'done'>();
  for (const root of children.keys()) {
    if (state.has(root)) continue;
    const stack: { node: string; next: number }[] = [{ node: root, next: 0 }];
    state.set(root, 'active');
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const outgoing = children.get(frame.node) ?? [];
      if (frame.next >= outgoing.length) {
        state.set(frame.node, 'done');
        stack.pop();
        continue;
      }
      const { target, edgeIndex } = outgoing[frame.next]!;
      frame.next += 1;
      const targetState = state.get(target);
      if (targetState === 'active') return edgeIndex;
      if (targetState === undefined) {
        state.set(target, 'active');
        stack.push({ node: target, next: 0 });
      }
    }
  }
  return null;
}
