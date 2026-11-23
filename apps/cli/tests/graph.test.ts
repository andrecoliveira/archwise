import { describe, expect, test } from 'vitest';
import { buildArchitectureGraph, viewNodeId } from '../src/graph.js';
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
  runtimeDependencies: dependencies,
  devDependencies: [],
  workspaces: null,
  sha256: '0',
});

const sample: InventoryResult = {
  version: 2,
  roots: ['/private/home/developer'],
  repositories: [repository({ id: 'repo-root', label: 'developer', path: '', nested: false })],
  listedEntries: 10,
  files: [],
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

test('packages are observed modules in the v2 shape', () => {
  const graph = buildArchitectureGraph(sample);
  expect(graph.version).toBe(2);
  expect(graph.gaps).toEqual([]);
  expect(graph.nodes[0]).toMatchObject({
    type: 'module',
    technology: 'fastify',
    confidence: 'observed',
    reasons: ['manifest-declared'],
    outsideWorkspace: false,
    aliases: [],
  });
  expect(graph.edges[0]).toMatchObject({
    type: 'depends-on',
    confidence: 'observed',
    reasons: ['dependency-declared'],
    evidence: [
      {
        path: 'apps/web/package.json',
        kind: 'package-dependency',
        lines: null,
        analyzer: 'node-manifest',
      },
    ],
  });
});

test('without analysis the graph has only packages and no infrastructure', () => {
  const graph = buildArchitectureGraph({ ...sample, manifests: [sample.manifests[1]!] });
  expect(graph.nodes).toHaveLength(1);
  expect(graph.edges).toHaveLength(0);
});

test('a truncated scan is visible as a graph diagnostic', () => {
  const graph = buildArchitectureGraph({ ...sample, truncated: 'time' });
  expect(graph.diagnostics).toContain('Scan truncated: time budget reached. Results are partial.');
  expect(graph.inspectedEntries).toBe(10);
});

describe('several roots', () => {
  const apiId = 'repo-1111111111111111';
  const webId = 'repo-2222222222222222';
  const inRoot = (
    rootId: string,
    name: string,
    dependencies: string[] = [],
    path = 'package.json',
  ): InventoryManifest => ({
    ...manifest(path, name, null, dependencies),
    repositoryId: rootId,
    rootId,
  });
  const multi = (manifests: InventoryManifest[]): InventoryResult => ({
    ...sample,
    roots: ['/w/api', '/w/web'],
    repositories: [
      repository({ id: apiId, rootId: apiId, label: 'api', path: '', nested: false }),
      repository({ id: webId, rootId: webId, label: 'web', path: '', nested: false }),
    ],
    manifests,
  });

  test('IDs carry the user-root ID and dependencies cross repositories', () => {
    const graph = buildArchitectureGraph(
      multi([inRoot(apiId, '@shop/api'), inRoot(webId, '@shop/web', ['@shop/api'])]),
    );
    expect(graph.nodes.map((n) => n.id)).toEqual([
      `package:${apiId}/package.json`,
      `package:${webId}/package.json`,
    ]);
    expect(graph.edges.map((e) => e.id)).toEqual([
      `dependency:package:${webId}/package.json->package:${apiId}/package.json`,
    ]);
    expect(graph.nodes.map((n) => n.repository)).toEqual([
      { id: apiId, label: 'api' },
      { id: webId, label: 'web' },
    ]);
    expect(graph.nodes.map((n) => n.evidence[0]!.path)).toEqual(['package.json', 'package.json']);
  });

  test('the same package name in two repositories is ambiguous, with prefixed paths', () => {
    const graph = buildArchitectureGraph(
      multi([
        inRoot(apiId, '@shop/x'),
        inRoot(webId, '@shop/x'),
        inRoot(webId, 'u', ['@shop/x'], 'u/package.json'),
      ]),
    );
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toEqual([]);
    expect(graph.diagnostics).toContain(
      'Ambiguous package name: @shop/x (api/package.json, web/package.json)',
    );
    expect(graph.diagnostics).toContain(
      'Unresolved dependency @shop/x in web/u/package.json: multiple workspace matches',
    );
  });

  test('viewNodeId keeps single-root IDs', () => {
    expect(viewNodeId({ rootId: 'repo-root', path: 'a/package.json' }, false)).toBe(
      'package:a/package.json',
    );
    expect(viewNodeId({ rootId: apiId, path: 'a/package.json' }, true)).toBe(
      `package:${apiId}/a/package.json`,
    );
  });

  test('a single root with nested repositories has no repository field', () => {
    const graph = buildArchitectureGraph({
      ...sample,
      repositories: [
        ...sample.repositories,
        repository({ id: 'repo-3333333333333333', label: 'sub', path: 'libs/sub', nested: true }),
      ],
    });
    expect(graph.nodes.every((n) => !('repository' in n))).toBe(true);
  });
});
