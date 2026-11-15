import { describe, expect, test } from 'vitest';
import { EDGE_KINDS, NODE_KINDS, validateRevision, type ValidationIssue } from '../src/index.js';
import { validRevision, type MutableRevision } from './fixtures.js';
import { syntheticSecrets } from './secrets.js';

const issuesOf = (mutate: (r: MutableRevision) => void): readonly ValidationIssue[] => {
  const revision = validRevision();
  mutate(revision);
  return validateRevision(revision);
};

test('the synthetic fixture is valid', () => {
  expect(validateRevision(validRevision())).toEqual([]);
});

describe('rejects each invariant violation with a stable code and structural path', () => {
  test.each<[string, (r: MutableRevision) => void, ValidationIssue]>([
    ['invalid revision id', (r) => (r.id = 'bad id'), { code: 'invalid-id', path: ['id'] }],
    [
      'invalid evidence analyzer id',
      (r) => (r.evidence[0]!.analyzerId = '-x'),
      { code: 'invalid-id', path: ['evidence', 0, 'analyzerId'] },
    ],
    [
      'duplicate node id',
      (r) => (r.nodes[1]!.id = 'svc-a'),
      { code: 'duplicate-id', path: ['nodes', 1, 'id'] },
    ],
    [
      'dangling edge target',
      (r) => (r.edges[0]!.targetId = 'missing'),
      { code: 'dangling-reference', path: ['edges', 0, 'targetId'] },
    ],
    [
      'dangling evidence reference',
      (r) => (r.nodes[0]!.evidenceIds = ['ev-missing']),
      { code: 'dangling-reference', path: ['nodes', 0, 'evidenceIds', 0] },
    ],
    [
      'dangling node repository',
      (r) => (r.nodes[0]!.repositoryId = 'repo-missing'),
      { code: 'dangling-reference', path: ['nodes', 0, 'repositoryId'] },
    ],
    [
      'dangling evidence repository',
      (r) => (r.evidence[2]!.repositoryId = 'repo-missing'),
      { code: 'dangling-reference', path: ['evidence', 2, 'repositoryId'] },
    ],
    [
      'dangling coverage repository',
      (r) => (r.coverage[1]!.repositoryId = 'repo-missing'),
      { code: 'dangling-reference', path: ['coverage', 1, 'repositoryId'] },
    ],
    [
      'dangling diagnostic reference',
      (r) => (r.diagnostics[0]!.references = [{ kind: 'edge', id: 'mod-b' }]),
      { code: 'dangling-reference', path: ['diagnostics', 0, 'references', 0, 'id'] },
    ],
    [
      'node without evidence',
      (r) => (r.nodes[0]!.evidenceIds = []),
      { code: 'missing-evidence', path: ['nodes', 0, 'evidenceIds'] },
    ],
    [
      'edge without evidence',
      (r) => (r.edges[1]!.evidenceIds = []),
      { code: 'missing-evidence', path: ['edges', 1, 'evidenceIds'] },
    ],
    [
      'confidence without reasons',
      (r) => (r.nodes[0]!.confidence.reasons = []),
      { code: 'invalid-confidence', path: ['nodes', 0, 'confidence', 'reasons'] },
    ],
    [
      'invalid reason code',
      (r) => (r.edges[0]!.confidence.reasons = ['Not A Code']),
      { code: 'invalid-code', path: ['edges', 0, 'confidence', 'reasons', 0] },
    ],
    [
      'invalid diagnostic code',
      (r) => (r.diagnostics[0]!.code = 'Bad_Code'),
      { code: 'invalid-code', path: ['diagnostics', 0, 'code'] },
    ],
    [
      'duplicate evidence reference',
      (r) => (r.nodes[1]!.evidenceIds = ['ev-2', 'ev-2']),
      { code: 'duplicate-reference', path: ['nodes', 1, 'evidenceIds', 1] },
    ],
    [
      'duplicate reason',
      (r) => (r.nodes[0]!.confidence.reasons = ['a', 'a']),
      { code: 'duplicate-reference', path: ['nodes', 0, 'confidence', 'reasons', 1] },
    ],
    [
      'invalid label',
      (r) => (r.repositories[0]!.label = ''),
      { code: 'invalid-label', path: ['repositories', 0, 'label'] },
    ],
    [
      'calendar-impossible timestamp',
      (r) => (r.createdAt = '2026-02-30T00:00:00.000Z'),
      { code: 'invalid-timestamp', path: ['createdAt'] },
    ],
    [
      'end line before start line',
      (r) => (r.evidence[1]!.lines = { start: 7, end: 3 }),
      { code: 'invalid-line-range', path: ['evidence', 1, 'lines'] },
    ],
    [
      'zero line',
      (r) => (r.evidence[1]!.lines = { start: 0, end: 3 }),
      { code: 'invalid-line-range', path: ['evidence', 1, 'lines'] },
    ],
    [
      'fractional line',
      (r) => (r.evidence[1]!.lines = { start: 1.5, end: 3 }),
      { code: 'invalid-line-range', path: ['evidence', 1, 'lines'] },
    ],
    [
      'windows path',
      (r) => (r.evidence[0]!.path = 'C:\\repo\\package.json'),
      { code: 'unsafe-path', path: ['evidence', 0, 'path'] },
    ],
    [
      'traversal path',
      (r) => (r.evidence[0]!.path = '../outside/package.json'),
      { code: 'unsafe-path', path: ['evidence', 0, 'path'] },
    ],
    [
      'secret in label',
      (r) => (r.nodes[0]!.label = `key ${syntheticSecrets.aws}`),
      { code: 'secret-pattern', path: ['nodes', 0, 'label'] },
    ],
    [
      'secret in path',
      (r) => (r.evidence[0]!.path = `config/${syntheticSecrets.github}`),
      { code: 'secret-pattern', path: ['evidence', 0, 'path'] },
    ],
    [
      'secret-shaped id',
      (r) => (r.repositories[1]!.id = syntheticSecrets.aws),
      { code: 'secret-pattern', path: ['repositories', 1, 'id'] },
    ],
    [
      'parent equals self',
      (r) => (r.parentRevisionId = 'rev-1'),
      { code: 'parent-is-self', path: ['parentRevisionId'] },
    ],
    [
      'complete revision with partial coverage',
      (r) => (r.coverage[0]!.status = 'partial'),
      { code: 'incomplete-coverage', path: ['coverage', 0, 'status'] },
    ],
    [
      'complete revision with failed coverage',
      (r) => (r.coverage[1]!.status = 'failed'),
      { code: 'incomplete-coverage', path: ['coverage', 1, 'status'] },
    ],
    [
      'duplicate coverage key',
      (r) => (r.coverage[1]!.repositoryId = 'repo-a'),
      { code: 'duplicate-coverage', path: ['coverage', 1] },
    ],
    [
      'self containment',
      (r) => (r.edges[0]!.targetId = 'svc-a'),
      { code: 'self-containment', path: ['edges', 0] },
    ],
  ])('%s', (_name, mutate, expected) => {
    expect(issuesOf(mutate)).toContainEqual(expected);
  });
});

test('collections beyond the limit are rejected', () => {
  const issues = issuesOf((r) => {
    r.diagnostics = Array.from({ length: 10_001 }, (_, i) => ({
      id: `d-${i}`,
      severity: 'info' as const,
      code: 'note',
      references: [],
    }));
  });
  expect(issues).toContainEqual({ code: 'limit-exceeded', path: ['diagnostics'] });
});

test('reference lists beyond the limit are rejected', () => {
  const issues = issuesOf((r) => {
    r.nodes[0]!.confidence.reasons = Array.from({ length: 1_001 }, (_, i) => `r-${i}`);
  });
  expect(issues).toContainEqual({
    code: 'limit-exceeded',
    path: ['nodes', 0, 'confidence', 'reasons'],
  });
});

test('partial revisions may carry partial or failed coverage', () => {
  expect(
    issuesOf((r) => {
      r.status = 'partial';
      r.coverage[0]!.status = 'partial';
      r.coverage[1]!.status = 'failed';
    }),
  ).toEqual([]);
});

test.each(NODE_KINDS)('node kind %s is valid', (kind) => {
  expect(issuesOf((r) => (r.nodes[0]!.kind = kind))).toEqual([]);
});

test.each(EDGE_KINDS)('edge kind %s is valid', (kind) => {
  // svc-a -> mod-b is acyclic for every kind, including contains.
  expect(issuesOf((r) => (r.edges[0]!.kind = kind))).toEqual([]);
});

test('IDs only need to be unique within their own collection', () => {
  expect(issuesOf((r) => (r.edges[0]!.id = 'svc-a'))).toEqual([]);
});

test('dependency cycles and self-calls are representable', () => {
  expect(
    issuesOf((r) => {
      r.edges.push({
        id: 'e-dep-1',
        kind: 'depends-on',
        sourceId: 'svc-a',
        targetId: 'mod-b',
        confidence: { level: 'observed', reasons: ['x'] },
        evidenceIds: ['ev-1'],
      });
      r.edges.push({
        id: 'e-dep-2',
        kind: 'depends-on',
        sourceId: 'mod-b',
        targetId: 'svc-a',
        confidence: { level: 'observed', reasons: ['x'] },
        evidenceIds: ['ev-1'],
      });
    }),
  ).toEqual([]);
});

test('containment cycles are rejected', () => {
  const issues = issuesOf((r) => {
    r.edges.push({
      id: 'e-contains-back',
      kind: 'contains',
      sourceId: 'mod-b',
      targetId: 'svc-a',
      confidence: { level: 'observed', reasons: ['x'] },
      evidenceIds: ['ev-1'],
    });
  });
  expect(issues.map((issue) => issue.code)).toContain('containment-cycle');
});

test('a long containment chain does not overflow the stack', () => {
  const issues = issuesOf((r) => {
    r.nodes = Array.from({ length: 10_000 }, (_, i) => ({
      id: `n-${i}`,
      kind: 'module' as const,
      label: `Node ${i}`,
      repositoryId: null,
      confidence: { level: 'observed' as const, reasons: ['x'] },
      evidenceIds: ['ev-1'],
    }));
    r.edges = Array.from({ length: 9_999 }, (_, i) => ({
      id: `c-${i}`,
      kind: 'contains' as const,
      sourceId: `n-${i}`,
      targetId: `n-${i + 1}`,
      confidence: { level: 'observed' as const, reasons: ['x'] },
      evidenceIds: ['ev-1'],
    }));
    r.diagnostics = [];
  });
  expect(issues).toEqual([]);
});

describe('enum values from untyped callers are reported, never thrown', () => {
  const bogus = 'bogus' as never;
  test.each<[string, (r: MutableRevision) => void, (string | number)[]]>([
    ['revision status', (r) => (r.status = bogus), ['status']],
    ['coverage status', (r) => (r.coverage[0]!.status = bogus), ['coverage', 0, 'status']],
    ['node kind', (r) => (r.nodes[0]!.kind = bogus), ['nodes', 0, 'kind']],
    ['edge kind', (r) => (r.edges[0]!.kind = bogus), ['edges', 0, 'kind']],
    [
      'confidence level',
      (r) => (r.nodes[0]!.confidence.level = bogus),
      ['nodes', 0, 'confidence', 'level'],
    ],
    [
      'diagnostic severity',
      (r) => (r.diagnostics[0]!.severity = bogus),
      ['diagnostics', 0, 'severity'],
    ],
    [
      'diagnostic reference kind',
      (r) => (r.diagnostics[0]!.references = [{ kind: bogus, id: 'mod-b' }]),
      ['diagnostics', 0, 'references', 0, 'kind'],
    ],
  ])('%s', (_name, mutate, path) => {
    expect(issuesOf(mutate)).toContainEqual({ code: 'invalid-value', path });
  });
});
