import { readFile, writeFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  analysisInputs,
  analyzerInputs,
  runAnalyzers,
  type Analyzer,
  type InventoryResult,
} from '@archwise/application';
import { BUILTIN_ANALYZERS } from '@archwise/analyzers';
import { filesystemInventory } from '@archwise/discovery';
import { SYSTEM_FIXTURE, createFixture, type Fixture } from '@archwise/test-fixtures';
import { buildArchitectureGraph, type ArchitectureGraph } from '../src/graph.js';

const GOLDEN_GRAPH = new URL('./golden/system-fixture.graph.json', import.meta.url);
const update = process.env.UPDATE_GOLDEN === '1';

async function scanFixture(files: Readonly<Record<string, string>>): Promise<{
  fixture: Fixture;
  inventory: InventoryResult;
}> {
  const fixture = await createFixture(files);
  const inventory = await filesystemInventory.inspect({
    roots: [{ path: fixture.root }],
    knownHomes: [],
    inputs: analyzerInputs(BUILTIN_ANALYZERS),
  });
  return { fixture, inventory };
}

function graphOf(inventory: InventoryResult, analyzers: readonly Analyzer[] = BUILTIN_ANALYZERS) {
  return buildArchitectureGraph(
    inventory,
    runAnalyzers({ analyzers, repositories: analysisInputs(inventory) }),
  );
}

describe('system fixture', () => {
  let fixture: Fixture;
  let inventory: InventoryResult;
  let graph: ArchitectureGraph;
  beforeAll(async () => {
    ({ fixture, inventory } = await scanFixture(SYSTEM_FIXTURE));
    graph = graphOf(inventory);
  });
  afterAll(async () => fixture.dispose());

  test('matches the golden graph', async () => {
    if (update) await writeFile(GOLDEN_GRAPH, `${JSON.stringify(graph, null, 2)}\n`);
    expect(graph).toEqual(JSON.parse(await readFile(GOLDEN_GRAPH, 'utf8')));
  });

  test('the fixture shows the expected system', () => {
    const triples = graph.nodes.map((node) => [node.id, node.type, node.confidence]);
    expect(triples).toEqual(
      expect.arrayContaining([
        ['package:apps/web/package.json', 'frontend', 'inferred'],
        ['package:apps/api/package.json', 'service', 'observed'],
        ['package:apps/worker/package.json', 'service', 'observed'],
        ['package:packages/db/package.json', 'module', 'observed'],
        ['compose:compose.yaml#db', 'datastore', 'observed'],
        ['compose:compose.yaml#cache', 'datastore', 'observed'],
        ['external:stripe', 'external-system', 'inferred'],
        ['queue:bullmq', 'queue', 'inferred'],
      ]),
    );
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    expect(byId.get('package:apps/api/package.json')!.aliases).toEqual(['api']);
    expect(byId.get('package:examples/demo/package.json')!.outsideWorkspace).toBe(true);
    expect(byId.has('datastore:postgresql')).toBe(false);
  });

  test('the fixture has the expected edges', () => {
    const edges = new Map(graph.edges.map((edge) => [edge.id, edge]));
    const db = edges.get('depends-on:package:packages/db/package.json->compose:compose.yaml#db');
    expect(db?.confidence).toBe('inferred');
    expect(db?.reasons).toEqual(expect.arrayContaining(['client-library:pg', 'prisma-datasource']));
    const cache = edges.get('depends-on:package:apps/api/package.json->compose:compose.yaml#cache');
    expect(cache?.confidence).toBe('observed');
    expect(cache?.reasons).toEqual(['compose-depends-on']);
    expect(
      edges.has('dependency:package:apps/api/package.json->package:packages/db/package.json'),
    ).toBe(true);
  });

  test('a complete scan has no diagnostics and no gaps', () => {
    expect(graph.diagnostics).toEqual([]);
    expect(graph.gaps).toEqual([]);
  });

  test('the graph contains no secret', () => {
    const text = JSON.stringify(graph);
    expect(text).not.toContain('secret');
    expect(text).not.toContain('DATABASE_URL');
    expect(text).not.toContain('example-only');
  });

  test('two runs are byte-identical', async () => {
    const again = await scanFixture(SYSTEM_FIXTURE);
    try {
      expect(JSON.stringify(graphOf(again.inventory))).toBe(JSON.stringify(graph));
    } finally {
      await again.fixture.dispose();
    }
  });
});

test('ambiguous compose resources draw no edge', async () => {
  const compose = SYSTEM_FIXTURE['compose.yaml']!.replace(
    'services:\n',
    'services:\n  analytics:\n    image: postgres:16\n',
  );
  const { fixture, inventory } = await scanFixture({ ...SYSTEM_FIXTURE, 'compose.yaml': compose });
  try {
    const graph = graphOf(inventory);
    expect(graph.nodes.some((node) => node.id === 'datastore:postgresql')).toBe(true);
    const fromDb = graph.edges.filter((edge) => edge.source === 'package:packages/db/package.json');
    expect(fromDb.map((edge) => edge.target)).toEqual(['datastore:postgresql']);
    expect(graph.diagnostics).toContain(
      'Ambiguous resource: PostgreSQL (compose:compose.yaml#analytics, compose:compose.yaml#db)',
    );
  } finally {
    await fixture.dispose();
  }
});

test('a failing analyzer keeps packages', async () => {
  const { fixture, inventory } = await scanFixture(SYSTEM_FIXTURE);
  try {
    const failing: Analyzer = {
      descriptor: BUILTIN_ANALYZERS.find((a) => a.descriptor.id === 'docker-compose')!.descriptor,
      analyze() {
        throw new Error('boom');
      },
    };
    const analyzers = BUILTIN_ANALYZERS.map((a) =>
      a.descriptor.id === 'docker-compose' ? failing : a,
    );
    const graph = graphOf(inventory, analyzers);
    expect(graph.nodes.filter((node) => node.id.startsWith('package:'))).toHaveLength(6);
    expect(graph.nodes.some((node) => node.id.startsWith('compose:'))).toBe(false);
    const label = inventory.repositories[0]!.label;
    expect(graph.diagnostics).toContain(
      `Analyzer failed: docker-compose in ${label}. Its findings were discarded.`,
    );
  } finally {
    await fixture.dispose();
  }
});
