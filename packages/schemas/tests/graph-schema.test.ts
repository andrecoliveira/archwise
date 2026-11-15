import type { GraphRevision } from '@archwise/domain';
import { describe, expect, expectTypeOf, test } from 'vitest';
import type { z } from 'zod';
import { graphRevisionSchema, parseGraphEnvelope } from '../src/index.js';
import { syntheticAwsKey, validEnvelope } from './fixtures.js';

const codesOf = (input: unknown): string[] => {
  const result = parseGraphEnvelope(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
};

test('accepts a valid envelope and returns a frozen domain revision', () => {
  const result = parseGraphEnvelope(validEnvelope());
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.value.nodes.map((n) => n.id)).toEqual(['mod-b', 'svc-a']);
    expect(Object.isFrozen(result.value)).toBe(true);
  }
});

test('schema output stays compatible with the domain type', () => {
  expectTypeOf<z.output<typeof graphRevisionSchema>>().toExtend<GraphRevision>();
});

describe('format and version dispatch', () => {
  test.each([null, 'text', [], { ...validEnvelope(), format: 'other' }])(
    'rejects a non-graph format: %j',
    (input) => {
      expect(codesOf(input)).toEqual(['invalid-format']);
    },
  );
  test.each([
    ['1', 'malformed-version'],
    [1.5, 'malformed-version'],
    [undefined, 'malformed-version'],
    [0, 'unsupported-older-version'],
    [2, 'unsupported-future-version'],
  ])('version %j -> %s', (version, code) => {
    const result = parseGraphEnvelope({ ...validEnvelope(), version });
    expect(result).toEqual({ ok: false, issues: [{ code, path: ['version'] }] });
  });
});

describe('strict structure', () => {
  test.each<[string, (e: ReturnType<typeof validEnvelope>) => void, (string | number)[]]>([
    ['envelope', (e) => ((e as Record<string, unknown>).extra = 1), []],
    ['revision', (e) => (e.revision.extra = 1), ['revision']],
    ['node', (e) => (e.revision.nodes[0].extra = 1), ['revision', 'nodes', 0]],
    [
      'confidence',
      (e) => (e.revision.nodes[0].confidence.extra = 1),
      ['revision', 'nodes', 0, 'confidence'],
    ],
    ['evidence', (e) => (e.revision.evidence[0].extra = 1), ['revision', 'evidence', 0]],
  ])('rejects an unknown field on the %s', (_name, mutate, path) => {
    const envelope = validEnvelope();
    mutate(envelope);
    expect(parseGraphEnvelope(envelope)).toEqual({
      ok: false,
      issues: [{ code: 'unknown-field', path }],
    });
  });

  test('rejects an unknown node kind as invalid structure', () => {
    const envelope = validEnvelope();
    envelope.revision.nodes[0].kind = 'microservice';
    expect(parseGraphEnvelope(envelope)).toEqual({
      ok: false,
      issues: [{ code: 'invalid-structure', path: ['revision', 'nodes', 0, 'kind'] }],
    });
  });

  test('rejects a missing required field', () => {
    const envelope = validEnvelope();
    delete envelope.revision.edges;
    expect(codesOf(envelope)).toEqual(['invalid-structure']);
  });
});

test('semantic errors surface domain codes', () => {
  const envelope = validEnvelope();
  envelope.revision.edges[0].targetId = 'missing';
  expect(parseGraphEnvelope(envelope)).toEqual({
    ok: false,
    issues: [{ code: 'dangling-reference', path: ['revision', 'edges', 0, 'targetId'] }],
  });
});

test('an unknown field named like a secret is not echoed', () => {
  const envelope = validEnvelope();
  envelope.revision.nodes[0][syntheticAwsKey] = true;
  expect(JSON.stringify(parseGraphEnvelope(envelope))).not.toContain(syntheticAwsKey);
});

test('a secret inside an invalid ID is not echoed in the result', () => {
  const envelope = validEnvelope();
  envelope.revision.nodes[0].id = `${syntheticAwsKey} x`;
  const result = parseGraphEnvelope(envelope);
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain(syntheticAwsKey);
});
