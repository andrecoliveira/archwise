import { describe, expect, test } from 'vitest';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import type { GraphEvidence, GraphNode } from './graph-types.js';
import { systemGraph } from './system-view.js';
import {
  edgeLabels,
  nodeReasonLine,
  confidenceLevel,
  levelWord,
  lineStyle,
  primaryName,
  relationWording,
  secondLine,
  summaryLine,
} from './claims.js';

const at = (path: string, kind: string): GraphEvidence => ({
  path,
  kind,
  lines: null,
  analyzer: 'test',
});

const others = (prefix: string, count: number): GraphNode[] =>
  Array.from({ length: count }, (_, i) => discoveredNode(`${prefix}${i}`));

const api = discoveredNode('api', {
  type: 'service',
  label: '@shop/api',
  technology: 'fastify',
  evidence: [at('apps/api/package.json', 'package-manifest'), at('compose.yaml', 'compose-build')],
});
const db = discoveredNode('db', {
  type: 'datastore',
  label: 'db',
  technology: 'PostgreSQL',
  evidence: [at('compose.yaml', 'compose-image')],
});
const queue = discoveredNode('queue:bullmq', {
  type: 'queue',
  label: 'BullMQ',
  technology: 'BullMQ',
  confidence: 'inferred',
  evidence: [],
});
const stripe = discoveredNode('external:stripe', {
  type: 'external-system',
  label: 'Stripe',
  technology: 'Stripe',
  confidence: 'inferred',
  category: 'payments',
  evidence: [],
});
const slack = discoveredNode('external:slack', {
  type: 'external-system',
  label: 'Slack',
  technology: 'Slack',
  category: 'other',
  evidence: [],
});

describe('summaryLine', () => {
  const targets = others('t', 4);
  const sources = others('s', 2);
  const view = graphOf(
    [api, db, queue, stripe, slack, ...targets, ...sources],
    [
      ...targets.map((t) => discoveredEdge('api', t.id)),
      discoveredEdge('s0', 'api'),
      discoveredEdge('s0', 'db'),
      discoveredEdge('s1', 'db'),
      discoveredEdge('s0', 'queue:bullmq'),
      discoveredEdge('s1', 'queue:bullmq'),
      discoveredEdge('s1', 'external:stripe'),
    ],
  );
  const lines = {
    api: 'Service · fastify · runs in compose.yaml · uses 4 · used by 1',
    db: 'PostgreSQL datastore · runs in compose.yaml · used by 2',
    queue: 'Queue · BullMQ · inferred · used by 2',
    stripe: 'Payments API · Stripe · inferred · used by 1',
  };

  test('states the spec examples verbatim', () => {
    expect(summaryLine(api, view)).toBe(lines.api);
    expect(summaryLine(db, view)).toBe(lines.db);
    expect(summaryLine(queue, view)).toBe(lines.queue);
    expect(summaryLine(stripe, view)).toBe(lines.stripe);
  });

  test('an external system without a specific category is an external service', () => {
    expect(summaryLine(slack, view).startsWith('External service · ')).toBe(true);
  });

  test('states no purpose and no adjective', () => {
    for (const line of [...Object.values(lines), summaryLine(slack, view)]) {
      expect(line).not.toMatch(/\b(main|primary|the)\b/i);
    }
  });
});

test('primaryName is the package, service or technology name', () => {
  expect(primaryName(api)).toBe('@shop/api');
  expect(primaryName(db)).toBe('db');
});

test('secondLine shows technology and folder', () => {
  expect(secondLine(api)).toBe('fastify · apps/api');
  expect(secondLine(db)).toBe('PostgreSQL');
  const root = discoveredNode('root', { technology: 'next' });
  expect(secondLine(root)).toBe('next');
  const multi = discoveredNode('m', {
    technology: 'next',
    evidence: [at('web/package.json', 'package-manifest')],
    repository: { id: 'r', label: 'shop' },
  });
  expect(secondLine(multi)).toBe('next · web · shop');
});

test('relationWording follows the kind', () => {
  expect(relationWording('depends-on')).toBe('depends on');
  expect(relationWording('calls')).toBe('calls');
  expect(relationWording('publishes')).toBe('publishes to');
  expect(relationWording('consumes')).toBe('consumes from');
  expect(relationWording('reads')).toBe('reads');
  expect(relationWording('writes')).toBe('writes');
});

test('confidence levels, words and line styles', () => {
  expect(confidenceLevel(api)).toBe('observed');
  expect(confidenceLevel(queue)).toBe('inferred');
  expect(confidenceLevel({ ...api, type: 'kubernetes' } as unknown as GraphNode)).toBe('unknown');
  expect(confidenceLevel(discoveredEdge('a', 'b', { confidence: 'inferred' }))).toBe('inferred');
  expect(lineStyle('observed')).toBe('solid');
  expect(lineStyle('inferred')).toBe('dashed');
  expect(lineStyle('unknown')).toBe('dotted');
  expect(levelWord('observed')).toBe('Observed');
  expect(levelWord('inferred')).toBe('Inferred');
  expect(levelWord('unknown')).toBe('Unknown');
});

describe('canvas text', () => {
  const pg = discoveredNode('pg', {
    type: 'datastore',
    label: 'PostgreSQL',
    technology: 'PostgreSQL',
    confidence: 'inferred',
    reasons: ['client-library'],
  });

  test('an inferred node reads its first reason', () => {
    expect(nodeReasonLine(pg)).toBe('Inferred because: a package depends on its client library');
    expect(nodeReasonLine(api)).toBeNull();
  });

  test('a relation is labelled by its wording and expands with its first reason', () => {
    const edge = discoveredEdge('api', 'pg', {
      confidence: 'inferred',
      reasons: ['client-library:pg'],
    });
    const nodes = new Map([api, pg].map((node) => [node.id, node]));
    expect(edgeLabels(edge, nodes)).toEqual({
      label: 'depends on',
      focusLabel: 'depends on · because depends on pg, a PostgreSQL client library',
    });
    expect(edgeLabels(discoveredEdge('api', 'pg', { reasons: [] }), nodes).focusLabel).toBe(
      'depends on',
    );
  });

  test('an indirect relation names the libraries it runs through', () => {
    const lib = discoveredNode('lib', { label: '@shop/db' });
    const full = graphOf(
      [api, lib, pg],
      [
        discoveredEdge('api', 'lib'),
        discoveredEdge('lib', 'pg', { confidence: 'inferred', reasons: ['client-library:pg'] }),
      ],
    );
    const edge = systemGraph(full).edges[0]!;
    const nodes = new Map(full.nodes.map((node) => [node.id, node]));
    expect(edgeLabels(edge, nodes)).toEqual({
      label: 'depends on · through @shop/db',
      focusLabel:
        'depends on · through @shop/db · because package.json lists @shop/db as a dependency',
    });
  });
});
