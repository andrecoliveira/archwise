import { expect, test } from 'vitest';
import { buildArchitectureGraph } from '../src/graph.js';
import type { InventoryManifest, InventoryResult } from '@archwise/application';
import { repository } from './inventory-fixture.js';

const manifest = (
  path: string,
  name: string,
  framework: string | null,
  dependencies: string[],
): InventoryManifest => ({
  repositoryId: 'repo-root',
  rootId: 'repo-root',
  path,
  name,
  framework,
  dependencies,
  sha256: '0',
});

const sample: InventoryResult = {
  version: 2,
  roots: ['/private/home/developer'],
  repositories: [repository({ id: 'repo-root', label: 'developer', path: '', nested: false })],
  listedEntries: 10,
  bytesRead: 0,
  skipped: {},
  truncated: null,
  durationMs: 0,
  diagnostics: [],
  manifests: [
    manifest('apps/web/package.json', '@demo/web', 'next', ['next', '@demo/api', 'axios']),
    manifest('apps/api/package.json', '@demo/api', 'fastify', ['fastify', 'pg']),
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
  expect(JSON.stringify(graph)).not.toContain(sample.roots[0]);
});

test('produces stable output regardless of manifest order', () => {
  expect(buildArchitectureGraph(sample)).toEqual(
    buildArchitectureGraph({ ...sample, manifests: [...sample.manifests].reverse() }),
  );
});

test('does not infer edges from ambiguous names', () => {
  const graph = buildArchitectureGraph({
    ...sample,
    manifests: [...sample.manifests, manifest('other/api/package.json', '@demo/api', null, [])],
  });
  expect(graph.edges).toHaveLength(0);
  expect(graph.diagnostics.some((item) => item.startsWith('Ambiguous package name'))).toBe(true);
});

test('does not invent infrastructure from external libraries', () => {
  const graph = buildArchitectureGraph({ ...sample, manifests: [sample.manifests[1]!] });
  expect(graph.nodes).toHaveLength(1);
  expect(graph.edges).toHaveLength(0);
});

test('a truncated scan is visible as a graph diagnostic', () => {
  const graph = buildArchitectureGraph({ ...sample, truncated: 'time' });
  expect(graph.diagnostics).toContain('Scan truncated: time budget reached. Results are partial.');
  expect(graph.inspectedEntries).toBe(10);
});
