import { expect, test } from 'vitest';
import { canonicalizeRevision, createRevision, type GraphRevision } from '../src/index.js';
import { emptyRevision, validRevision } from './fixtures.js';

const expectOk = (result: ReturnType<typeof createRevision>): GraphRevision => {
  if (!result.ok) throw new Error(`expected ok, got ${JSON.stringify(result.issues)}`);
  return result.value;
};

test('accepts an empty partial revision', () => {
  expect(createRevision(emptyRevision()).ok).toBe(true);
});

test('later mutation of the caller input cannot change the revision', () => {
  const input = validRevision();
  const revision = expectOk(createRevision(input));
  input.nodes[0]!.label = 'Changed';
  input.nodes[0]!.confidence.reasons.push('late-reason');
  input.edges.pop();
  expect(revision.nodes.find((n) => n.id === 'svc-a')!.label).toBe('Service A');
  expect(revision.nodes.find((n) => n.id === 'svc-a')!.confidence.reasons).toEqual([
    'manifest-declared',
  ]);
  expect(revision.edges).toHaveLength(2);
});

test('accepted revisions are deeply frozen', () => {
  const revision = expectOk(createRevision(validRevision()));
  expect(Object.isFrozen(revision)).toBe(true);
  expect(Object.isFrozen(revision.nodes)).toBe(true);
  expect(Object.isFrozen(revision.nodes[0])).toBe(true);
  expect(Object.isFrozen(revision.nodes[0]!.confidence.reasons)).toBe(true);
  expect(Object.isFrozen(revision.evidence[0])).toBe(true);
  expect(Object.isFrozen(revision.diagnostics[0]!.references[0])).toBe(true);
});

test('collection order in the input does not change the result', () => {
  const reversed = validRevision();
  reversed.repositories.reverse();
  reversed.coverage.reverse();
  reversed.evidence.reverse();
  reversed.nodes.reverse();
  reversed.edges.reverse();
  reversed.nodes[0]!.evidenceIds.reverse();
  expect(expectOk(createRevision(reversed))).toEqual(expectOk(createRevision(validRevision())));
});

test('canonical order sorts records by ID using code units', () => {
  const canonical = canonicalizeRevision(validRevision());
  expect(canonical.nodes.map((n) => n.id)).toEqual(['mod-b', 'svc-a']);
  expect(canonical.edges.map((e) => e.id)).toEqual(['e-call', 'e-contains']);
});

test('undeclared properties are not copied into the revision', () => {
  const input = validRevision() as unknown as Record<string, unknown> & {
    nodes: Record<string, unknown>[];
  };
  input.extra = 1;
  input.nodes[0]!.extra = 'x';
  const revision = expectOk(createRevision(input as unknown as GraphRevision));
  expect('extra' in revision).toBe(false);
  expect(revision.nodes.some((node) => 'extra' in node)).toBe(false);
});

test('invalid input returns issues without a partially accepted value', () => {
  const input = validRevision();
  input.edges[0]!.targetId = 'missing';
  const result = createRevision(input);
  expect(result.ok).toBe(false);
  expect('value' in result).toBe(false);
});
