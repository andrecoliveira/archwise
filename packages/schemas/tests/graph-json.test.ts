import type { GraphRevision } from '@archwise/domain';
import { describe, expect, test } from 'vitest';
import { importGraphJson, parseGraphEnvelope, serializeGraphRevision } from '../src/index.js';
import { syntheticAwsKey, validEnvelope } from './fixtures.js';
import { GOLDEN_REVISION_JSON } from './golden.js';

const revisionOf = (envelope: unknown): GraphRevision => {
  const result = parseGraphEnvelope(envelope);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};

const serialized = (revision: GraphRevision): string => {
  const result = serializeGraphRevision(revision);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.value;
};

/** Deterministic permutation using a small linear congruential generator. */
function shuffle<T>(values: T[], seed: number): T[] {
  let state = seed;
  const next = () => (state = (state * 1_103_515_245 + 12_345) % 2_147_483_648);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = next() % (i + 1);
    [values[i], values[j]] = [values[j]!, values[i]!];
  }
  return values;
}

test('serializes the fixture to the golden canonical bytes', () => {
  expect(serialized(revisionOf(validEnvelope()))).toBe(GOLDEN_REVISION_JSON);
});

test('output is compact and has no trailing newline', () => {
  const text = serialized(revisionOf(validEnvelope()));
  expect(text.endsWith('\n')).toBe(false);
  expect(text).not.toMatch(/\n|": /);
});

test('serialization is invariant under input permutations', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const envelope = validEnvelope();
    const r = envelope.revision;
    for (const key of ['repositories', 'coverage', 'evidence', 'nodes', 'edges', 'diagnostics']) {
      shuffle(r[key], seed);
    }
    for (const item of [...r.nodes, ...r.edges]) {
      shuffle(item.evidenceIds, seed);
      shuffle(item.confidence.reasons, seed);
    }
    expect(serialized(revisionOf(envelope))).toBe(GOLDEN_REVISION_JSON);
  }
});

test('import then serialize round-trips byte-identically', () => {
  const first = serialized(revisionOf(validEnvelope()));
  const imported = importGraphJson(first);
  expect(imported.ok).toBe(true);
  if (imported.ok) expect(serialized(imported.value)).toBe(first);
});

test('Unicode labels round-trip without normalization', () => {
  const label = '\u{1F680} e\u0301 \u0645\u0631\u062D\u0628\u0627'; // NFD + RTL: normalization would change bytes
  const envelope = validEnvelope();
  envelope.revision.nodes[0].label = label;
  const text = serialized(revisionOf(envelope));
  const imported = importGraphJson(text);
  expect(imported.ok && imported.value.nodes.find((n) => n.id === 'svc-a')!.label).toBe(label);
  expect(imported.ok && serialized(imported.value)).toBe(text);
});

describe('bounded import', () => {
  test('rejects input above 16 MiB measured as UTF-8 bytes', () => {
    const text = '"' + '€'.repeat(5_592_406) + '"';
    expect(text.length).toBeLessThan(16_777_216);
    expect(importGraphJson(text)).toEqual({
      ok: false,
      issues: [{ code: 'input-too-large', path: [] }],
    });
  });

  test('rejects malformed JSON', () => {
    expect(importGraphJson('{')).toEqual({
      ok: false,
      issues: [{ code: 'invalid-json', path: [] }],
    });
  });

  test('treats __proto__ as an unknown field without polluting prototypes', () => {
    const text = serialized(revisionOf(validEnvelope())).replace(
      '"revision":{',
      '"revision":{"__proto__":{"polluted":1},',
    );
    expect(importGraphJson(text)).toEqual({
      ok: false,
      issues: [{ code: 'unknown-field', path: ['revision'] }],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

test('refuses to serialize a secret-bearing label and does not echo it', () => {
  const revision = revisionOf(validEnvelope());
  const tampered = {
    ...revision,
    nodes: revision.nodes.map((n) => ({ ...n, label: `key ${syntheticAwsKey}` })),
  };
  const result = serializeGraphRevision(tampered);
  expect(result.ok).toBe(false);
  expect(result.ok ? [] : result.issues.map((i) => i.code)).toContain('secret-pattern');
  expect(JSON.stringify(result)).not.toContain(syntheticAwsKey);
});

test('serialization excludes undeclared fields', () => {
  const revision = revisionOf(validEnvelope());
  const withExtra = { ...revision, absoluteRoot: '/home/user/repo' } as GraphRevision;
  expect(serialized(withExtra)).not.toContain('absoluteRoot');
});

test.each([
  [256, true],
  [257, false],
])('a %i code point label imports: %s', (count, ok) => {
  const envelope = validEnvelope();
  envelope.revision.nodes[0].label = '\u{1F680}'.repeat(count);
  expect(importGraphJson(JSON.stringify(envelope)).ok).toBe(ok);
});
