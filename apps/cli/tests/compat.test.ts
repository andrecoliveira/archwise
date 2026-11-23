import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { analysisInputs, analyzerInputs, runAnalyzers } from '@archwise/application';
import { BUILTIN_ANALYZERS } from '@archwise/analyzers';
import { filesystemInventory } from '@archwise/discovery';
import { buildArchitectureGraph } from '../src/graph.js';
import { buildGraphRevision } from '../src/revision.js';
import baseline from './fixtures/compat-baseline.json' with { type: 'json' };

// The baseline was produced by the pre-Phase-3 inventory on this exact tree (view graph v1).
// Unchanged projects must keep their view identity (node and edge IDs, labels, technology and
// evidence paths, which are the projectSignature inputs) and revision IDs. The v2 shape adds
// fields around them.

interface ViewLike {
  readonly nodes: readonly {
    readonly id: string;
    readonly label: string;
    readonly evidence: readonly { readonly path: string }[];
  }[];
  readonly edges: readonly {
    readonly id: string;
    readonly source: string;
    readonly target: string;
  }[];
  readonly diagnostics: readonly string[];
}
const identity = (view: ViewLike) => ({
  nodes: view.nodes.map((n) => [n.id, n.label, n.evidence.map((e) => e.path)]),
  edges: view.edges.map((e) => [e.id, e.source, e.target]),
  diagnostics: view.diagnostics,
});
const technologies = (view: {
  nodes: readonly { technology?: string | null; framework?: string | null }[];
}) => view.nodes.map((n) => n.technology ?? n.framework ?? null);
let root = '';
beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'archwise-compat-')));
  const files: Record<string, unknown> = {
    'package.json': { name: 'demo-root', private: true },
    'apps/web/package.json': { name: '@demo/web', dependencies: { '@demo/core': '*', next: '1' } },
    'apps/api/package.json': {
      name: '@demo/api',
      dependencies: { '@demo/core': '*', fastify: '1' },
    },
    'packages/core/package.json': { name: '@demo/core' },
  };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), JSON.stringify(content));
  }
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

test('an unchanged single-root project keeps its view and revision identifiers', async () => {
  const inventory = await filesystemInventory.inspect({ roots: [{ path: root }], knownHomes: [] });
  const graph = buildArchitectureGraph(inventory);
  expect(identity(graph)).toEqual(identity(baseline.view));
  expect(technologies(graph)).toEqual(technologies(baseline.view));
  const revision = buildGraphRevision(graph, inventory, {
    revisionId: 'rev-1',
    workspaceId: 'ws-1',
    parentRevisionId: null,
    createdAt: '2026-11-16T00:00:00.000Z',
  });
  expect(revision.nodes.map((n) => n.id)).toEqual(baseline.nodes);
  expect(revision.edges.map((e) => e.id)).toEqual(baseline.edges);
  expect(revision.evidence.map((e) => e.id)).toEqual(baseline.evidence);
});

test('a single root whose package lives in a submodule keeps the same view and IDs', async () => {
  const marker = join(root, 'packages/core/.git');
  await writeFile(marker, 'gitdir: ../../.git/modules/core');
  try {
    const inventory = await filesystemInventory.inspect({
      roots: [{ path: root }],
      knownHomes: [],
    });
    expect(inventory.repositories.filter((r) => r.nested)).toHaveLength(1);
    const graph = buildArchitectureGraph(inventory);
    expect(identity(graph)).toEqual(identity(baseline.view));
    expect(technologies(graph)).toEqual(technologies(baseline.view));
    expect(graph.nodes.every((n) => !('repository' in n))).toBe(true);
    const revision = buildGraphRevision(graph, inventory, {
      revisionId: 'rev-1',
      workspaceId: 'ws-1',
      parentRevisionId: null,
      createdAt: '2026-11-16T00:00:00.000Z',
    });
    expect(revision.nodes.map((n) => n.id)).toEqual(baseline.nodes);
    expect(revision.evidence.map((e) => e.id)).toEqual(baseline.evidence);
  } finally {
    await rm(marker);
  }
});

test('with the built-in analyzers, modules and edges keep their Phase 3 revision IDs', async () => {
  const inventory = await filesystemInventory.inspect({
    roots: [{ path: root }],
    knownHomes: [],
    inputs: analyzerInputs(BUILTIN_ANALYZERS),
  });
  const analysis = runAnalyzers({
    analyzers: BUILTIN_ANALYZERS,
    repositories: analysisInputs(inventory),
  });
  const graph = buildArchitectureGraph(inventory, analysis);
  const revision = buildGraphRevision(
    graph,
    inventory,
    {
      revisionId: 'rev-1',
      workspaceId: 'ws-1',
      parentRevisionId: null,
      createdAt: '2026-11-16T00:00:00.000Z',
    },
    analysis,
  );
  // The root and core packages stay modules; web (next) and api (fastify) gain roles.
  const modules = revision.nodes.filter((n) => n.kind === 'module').map((n) => n.id);
  expect(modules).toEqual(baseline.nodes.filter((id) => modules.includes(id)));
  expect(modules).toHaveLength(2);
  expect(revision.edges.map((e) => e.id)).toEqual(baseline.edges);
  for (const id of baseline.evidence) {
    expect(revision.evidence.map((e) => e.id)).toContain(id);
  }
  expect(revision.coverage.map((c) => c.analyzerId)).toEqual([
    'node-manifest',
    'docker-compose',
    'node-roles',
    'node-workspace',
    'prisma-schema',
  ]);
});
