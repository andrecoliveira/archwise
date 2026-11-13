import { expect, test } from 'vitest';
import { buildArchitectureGraph } from '../src/graph.js';
import type { InventoryResult } from '../src/inventory.js';

const sample: InventoryResult = {
  version: 1,
  root: '/private/home/developer',
  inspectedEntries: 10,
  diagnostics: [],
  manifests: [
    { path: 'apps/web/package.json', name: '@demo/web', framework: 'next', dependencies: ['next', '@demo/api', 'axios'] },
    { path: 'apps/api/package.json', name: '@demo/api', framework: 'fastify', dependencies: ['fastify', 'pg'] },
  ],
};

test('creates evidence-backed nodes and only verified internal dependencies', () => {
  const graph = buildArchitectureGraph(sample);
  expect(graph.nodes.map((item) => item.id)).toEqual([
    'package:apps/api/package.json',
    'package:apps/web/package.json',
  ]);
  expect(graph.edges).toHaveLength(1);
  expect(graph.edges[0]?.source).toBe('package:apps/web/package.json');
  expect(graph.edges[0]?.target).toBe('package:apps/api/package.json');
  expect(graph.nodes[0]?.evidence[0]?.path).toBe('apps/api/package.json');
  expect(JSON.stringify(graph)).not.toContain(sample.root);
});

test('produces stable output regardless of manifest order', () => {
  expect(buildArchitectureGraph(sample)).toEqual(
    buildArchitectureGraph({ ...sample, manifests: [...sample.manifests].reverse() }),
  );
});

test('does not infer edges from ambiguous names', () => {
  const graph = buildArchitectureGraph({
    ...sample,
    manifests: [
      ...sample.manifests,
      { path: 'other/api/package.json', name: '@demo/api', framework: null, dependencies: [] },
    ],
  });
  expect(graph.edges).toHaveLength(0);
  expect(graph.diagnostics.some((item) => item.startsWith('Ambiguous package name'))).toBe(true);
});

test('does not invent infrastructure from external libraries', () => {
  const graph = buildArchitectureGraph({ ...sample, manifests: [sample.manifests[1]!] });
  expect(graph.nodes).toHaveLength(1);
  expect(graph.edges).toHaveLength(0);
});
