import { describe, expect, test } from 'vitest';
import { REASON_CODE_FAMILIES } from '@archwise/application';
import { discoveredNode } from './graph-fixtures.js';
import type { GraphEvidence } from './graph-types.js';
import { REASON_SENTENCE_FAMILIES, describeReason, evidenceKey } from './reason-catalog.js';

const text = (view: { readonly parts: readonly { readonly text: string }[] }): string =>
  view.parts.map((part) => part.text).join('');
const at = (path: string, kind: string, lines: GraphEvidence['lines'] = null): GraphEvidence => ({
  path,
  kind,
  lines,
  analyzer: 'test',
});

const api = discoveredNode('api', { type: 'service', label: '@shop/api', technology: 'fastify' });
const web = discoveredNode('web', { type: 'frontend', label: '@shop/web', technology: 'next' });
const postgres = discoveredNode('pg', {
  type: 'datastore',
  label: 'PostgreSQL',
  technology: 'PostgreSQL',
});

test('every reason family has a sentence', () => {
  expect([...REASON_SENTENCE_FAMILIES].sort()).toEqual([...REASON_CODE_FAMILIES].sort());
});

test('client-library names the library and the target technology', () => {
  const view = describeReason('client-library:pg', {
    subject: api,
    target: postgres,
    evidence: [at('apps/api/package.json', 'client-library')],
  });
  expect(text(view)).toBe('depends on pg, a PostgreSQL client library');
  expect(view.parts.find((part) => part.text === 'pg')?.strong).toBe(true);
  expect(view.file).toBe('apps/api/package.json');
  expect(view.code).toBe('client-library:pg');
  expect(view.known).toBe(true);
});

test('compose-depends-on names the target and the line', () => {
  const view = describeReason('compose-depends-on', {
    subject: api,
    target: discoveredNode('cache', { label: 'cache' }),
    evidence: [at('compose.yaml', 'compose-depends-on', { start: 14, end: 14 })],
  });
  expect(text(view)).toBe('Compose starts it after cache');
  expect(view.file).toBe('compose.yaml · line 14');
});

describe('the other sentences', () => {
  test.each([
    ['framework-dependency:fastify', api, undefined, 'depends on fastify, a server framework'],
    [
      'framework-dependency:next,express',
      web,
      undefined,
      'depends on next and express; the frontend framework wins',
    ],
    ['compose-build:api', api, undefined, 'Compose builds it as service api'],
    ['compose-image', postgres, undefined, 'Compose runs the PostgreSQL image'],
    ['compose-service', api, undefined, 'Compose declares it as a service'],
    ['manifest-declared', api, undefined, 'its package.json declares it'],
    [
      'dependency-declared',
      api,
      discoveredNode('db', { label: '@shop/db' }),
      'package.json lists @shop/db as a dependency',
    ],
    ['prisma-datasource', api, postgres, 'Prisma datasource is PostgreSQL'],
    ['client-library', postgres, undefined, 'a package depends on its client library'],
  ] as const)('%s', (code, subject, target, sentence) => {
    expect(
      text(describeReason(code, { subject, ...(target ? { target } : {}), evidence: [] })),
    ).toBe(sentence);
  });
});

test('a reason with no matching evidence shows no file', () => {
  const view = describeReason('compose-image', {
    subject: postgres,
    evidence: [at('package.json', 'package-manifest')],
  });
  expect(view.file).toBeNull();
});

test('a multi-line range names its lines', () => {
  const view = describeReason('compose-image', {
    subject: postgres,
    evidence: [at('compose.yaml', 'compose-image', { start: 2, end: 4 })],
  });
  expect(view.file).toBe('compose.yaml · lines 2–4');
});

test('unknown codes render as the raw code', () => {
  expect(describeReason('via @shop/db', { subject: api, evidence: [] })).toEqual({
    code: 'via @shop/db',
    parts: [{ text: 'via @shop/db' }],
    file: null,
    known: false,
  });
  expect(text(describeReason('', { subject: api, evidence: [] }))).toBe('(no reason recorded)');
});

test('evidenceKey distinguishes path, kind, analyzer and lines', () => {
  const a = at('compose.yaml', 'compose-image', { start: 2, end: 4 });
  expect(evidenceKey(a)).toBe(evidenceKey({ ...a }));
  expect(evidenceKey(a)).not.toBe(evidenceKey({ ...a, lines: { start: 2, end: 5 } }));
  expect(evidenceKey(a)).not.toBe(evidenceKey({ ...a, analyzer: 'other' }));
  expect(evidenceKey({ ...a, excerptId: 'x' })).toBe(evidenceKey(a));
});

test('a framework reason without a parameter still reads as a sentence', () => {
  expect(text(describeReason('framework-dependency:', { subject: api, evidence: [] }))).toBe(
    'depends on a server framework',
  );
});
