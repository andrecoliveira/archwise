import { expect, test } from 'vitest';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import { isGraph, upgradeGraph } from './graph-types.js';
import { projectSignature } from './sandbox-persistence.js';

/** A view graph as Phase 3 stored it in sessions. */
const v1 = {
  version: 1,
  nodes: [
    {
      id: 'package:apps/api/package.json',
      type: 'package',
      label: '@demo/api',
      origin: 'discovered',
      framework: 'fastify',
      evidence: [{ path: 'apps/api/package.json', kind: 'package-manifest' }],
    },
    {
      id: 'package:packages/core/package.json',
      type: 'package',
      label: '@demo/core',
      origin: 'discovered',
      framework: null,
      evidence: [{ path: 'packages/core/package.json', kind: 'package-manifest' }],
      repository: { id: 'repo-1', label: 'core' },
    },
  ],
  edges: [
    {
      id: 'dependency:package:apps/api/package.json->package:packages/core/package.json',
      type: 'declared-dependency',
      source: 'package:apps/api/package.json',
      target: 'package:packages/core/package.json',
      origin: 'discovered',
      evidence: [{ path: 'apps/api/package.json', kind: 'package-dependency' }],
    },
  ],
  diagnostics: ['Ambiguous package name: x (a, b)'],
  inspectedEntries: 7,
};

test('accepts a v2 graph', () => {
  const graph = graphOf(
    [
      discoveredNode('a'),
      discoveredNode('b', { type: 'datastore', confidence: 'inferred', evidence: [] }),
    ],
    [
      discoveredEdge('a', 'b', {
        evidence: [
          {
            path: 'compose.yaml',
            kind: 'compose-depends-on',
            lines: { start: 3, end: 4 },
            analyzer: 'docker-compose',
          },
        ],
      }),
    ],
    { gaps: [{ path: 'nx.json', analyzer: 'node-workspace', reason: 'unsupported' }] },
  );
  expect(isGraph(graph)).toBe(true);
});

test('rejects v1 and malformed v2 graphs in isGraph', () => {
  expect(isGraph(v1)).toBe(false);
  expect(isGraph(null)).toBe(false);
  expect(isGraph({ ...graphOf([]), gaps: 'x' })).toBe(false);
  expect(isGraph(graphOf([{ ...discoveredNode('a'), type: 'package' as never }]))).toBe(false);
  expect(isGraph(graphOf([{ ...discoveredNode('a'), confidence: 'maybe' as never }]))).toBe(false);
  expect(isGraph(graphOf([discoveredNode('a', { repository: { id: 'r' } as never })]))).toBe(false);
  expect(isGraph(graphOf([], [{ ...discoveredEdge('a', 'b'), reasons: [1] as never }]))).toBe(
    false,
  );
});

test('upgradeGraph converts a stored Phase 3 view with identical ids', () => {
  const upgraded = upgradeGraph(v1)!;
  expect(isGraph(upgraded)).toBe(true);
  expect(upgraded.nodes.map((n) => n.id)).toEqual(v1.nodes.map((n) => n.id));
  expect(upgraded.edges.map((e) => e.id)).toEqual(v1.edges.map((e) => e.id));
  expect(upgraded.nodes[0]).toEqual({
    id: 'package:apps/api/package.json',
    type: 'module',
    label: '@demo/api',
    technology: 'fastify',
    confidence: 'observed',
    reasons: ['manifest-declared'],
    outsideWorkspace: false,
    aliases: [],
    origin: 'discovered',
    evidence: [
      {
        path: 'apps/api/package.json',
        kind: 'package-manifest',
        lines: null,
        analyzer: 'node-manifest',
      },
    ],
  });
  expect(upgraded.nodes[1]!.repository).toEqual({ id: 'repo-1', label: 'core' });
  expect(upgraded.edges[0]).toMatchObject({ type: 'depends-on', reasons: ['dependency-declared'] });
  expect(upgraded.diagnostics).toEqual(v1.diagnostics);
  expect(upgraded.gaps).toEqual([]);
  expect(upgraded.inspectedEntries).toBe(7);
  // The Sandbox signature hashes IDs and evidence paths only, so it survives the upgrade.
  expect(projectSignature(upgraded)).toBe(projectSignature(v1 as never));
});

test('upgradeGraph keeps a valid v2 graph and rejects garbage', () => {
  const graph = graphOf([discoveredNode('a')]);
  expect(upgradeGraph(graph)).toEqual(graph);
  expect(upgradeGraph(null)).toBeNull();
  expect(
    upgradeGraph({ version: 1, nodes: [null], edges: [], diagnostics: [], inspectedEntries: 0 }),
  ).toBeNull();
  expect(
    upgradeGraph({
      version: 3,
      nodes: [],
      edges: [],
      diagnostics: [],
      gaps: [],
      inspectedEntries: 0,
    }),
  ).toBeNull();
});
