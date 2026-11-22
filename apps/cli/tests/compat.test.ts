import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { filesystemInventory } from '@archwise/discovery';
import { buildArchitectureGraph } from '../src/graph.js';
import { buildGraphRevision } from '../src/revision.js';
import baseline from './fixtures/compat-baseline.json' with { type: 'json' };

// The baseline was produced by the pre-Phase-3 inventory on this exact tree. Unchanged projects
// must keep their view (node IDs, evidence, projectSignature inputs) and revision IDs.
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
  expect({ ...graph, inspectedEntries: 0 }).toEqual(baseline.view);
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
