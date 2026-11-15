import { expect, test } from 'vitest';
import type { Graph } from './graph-types.js';
import {
  defaultSimulationDraft,
  parseSandboxDocument,
  projectSignature,
  serializeSandboxDocument,
  workspaceStorageKey,
  type SandboxDocument,
} from './sandbox-persistence.js';
import { captureScenario } from './scenario-comparison.js';

const graph: Graph = {
  version: 1,
  nodes: [
    {
      id: 'package:apps/web/package.json',
      label: 'web',
      type: 'package',
      framework: 'vite',
      origin: 'discovered',
      evidence: [{ path: 'apps/web/package.json', kind: 'package-manifest' }],
    },
  ],
  edges: [],
  diagnostics: [],
  inspectedEntries: 1,
};

function example(): SandboxDocument {
  return {
    format: 'archwise-sandbox',
    version: 1,
    projectSignature: projectSignature(graph),
    nodes: [
      { id: 'sandbox-1', label: 'Web API', kind: 'service', x: 200, y: 90 },
      { id: 'sandbox-2', label: 'Cache', kind: 'cache', x: 450, y: 90 },
    ],
    connections: [{ source: 'sandbox-1', target: 'sandbox-2' }],
    draft: {
      ...defaultSimulationDraft(),
      inputRps: 200,
      preferredEntryId: 'sandbox-1',
      capacities: { 'sandbox-1': 300, 'sandbox-2': 500 },
      hitRates: { 'sandbox-2': 0.7 },
      savedA: captureScenario('A', {
        incomingRps: 200,
        entryNodeId: 'sandbox-1',
        components: [
          {
            id: 'sandbox-1',
            kind: 'service',
            label: 'Web API',
            capacityRps: 300,
            baseLatencyMs: 20,
          },
        ],
        connections: [],
      }),
    },
  };
}

test('round-trips topology, controls and scenario A in versioned JSON', () => {
  const document = example();
  const encoded = serializeSandboxDocument(document);
  expect(parseSandboxDocument(encoded, projectSignature(graph))).toEqual(document);
  expect(JSON.parse(encoded)).toMatchObject({ format: 'archwise-sandbox', version: 1 });
});

test('keeps local storage isolated across discovered projects', () => {
  const alternative: Graph = {
    ...graph,
    nodes: [{ ...graph.nodes[0]!, id: 'package:other/package.json' }],
  };
  const signature = projectSignature(graph);
  expect(workspaceStorageKey(signature)).not.toBe(
    workspaceStorageKey(projectSignature(alternative)),
  );
  expect(() =>
    parseSandboxDocument(serializeSandboxDocument(example()), projectSignature(alternative)),
  ).toThrow('different discovered project');
});

test('rejects invalid JSON, unsupported versions and oversized imports', () => {
  const signature = projectSignature(graph);
  expect(() => parseSandboxDocument('{', signature)).toThrow('not valid JSON');
  expect(() =>
    parseSandboxDocument(JSON.stringify({ ...example(), version: 3 }), signature),
  ).toThrow('Unsupported');
  expect(() => parseSandboxDocument(' '.repeat(256 * 1024 + 1), signature)).toThrow('256 KiB');
});

test('rejects malicious or invalid nodes and edges without restoration', () => {
  const signature = projectSignature(graph);
  const invalids: unknown[] = [
    { ...example(), nodes: [{ ...example().nodes[0], id: 'package:source' }] },
    { ...example(), nodes: [example().nodes[0], example().nodes[0]] },
    { ...example(), connections: [{ source: 'sandbox-1', target: 'package:source' }] },
    {
      ...example(),
      connections: [
        { source: 'sandbox-1', target: 'sandbox-2' },
        { source: 'sandbox-1', target: 'sandbox-2' },
      ],
    },
    { ...example(), nodes: [{ ...example().nodes[0], x: Number.POSITIVE_INFINITY }] },
    { ...example(), draft: { ...example().draft, capacities: { 'sandbox-1': -1 } } },
    {
      ...example(),
      draft: {
        ...example().draft,
        savedA: { version: 1, slot: 'A', scenario: { incomingRps: -1 } },
      },
    },
  ];
  for (const value of invalids) {
    expect(() => parseSandboxDocument(JSON.stringify(value), signature)).toThrow();
  }
});

test('rejects cycles and invalid numeric model configuration', () => {
  const value = {
    ...example(),
    connections: [
      { source: 'sandbox-1', target: 'sandbox-2' },
      { source: 'sandbox-2', target: 'sandbox-1' },
    ],
  };
  expect(() => parseSandboxDocument(JSON.stringify(value), projectSignature(graph))).toThrow(
    'acyclic',
  );
  const invalid = {
    ...example(),
    draft: { ...example().draft, inputRps: Number.NaN },
  };
  expect(() => serializeSandboxDocument(invalid)).toThrow();
});

test('permits an empty Sandbox and preserves historical A/B snapshots', () => {
  const workspace = example();
  const empty = {
    ...workspace,
    nodes: [],
    connections: [],
    draft: {
      ...defaultSimulationDraft(),
      savedA: workspace.draft.savedA,
    },
  };
  expect(parseSandboxDocument(JSON.stringify(empty), projectSignature(graph)).draft.savedA).toEqual(
    workspace.draft.savedA,
  );
});

test('preserves semantic connections and accepts historical v1 JSON without intent', () => {
  const current = example();
  const typed = {
    ...current,
    connections: [{ source: 'sandbox-1', target: 'sandbox-2', intent: 'CACHE' as const }],
  };
  const parsed = parseSandboxDocument(serializeSandboxDocument(typed), projectSignature(graph));
  expect(parsed.connections[0]?.intent).toBe('CACHE');
  const legacy = parseSandboxDocument(JSON.stringify(current), projectSignature(graph));
  expect(legacy.connections[0]).toEqual({ source: 'sandbox-1', target: 'sandbox-2' });
});

test('rejects unknown imported connection intents', () => {
  const current = example();
  const bad = {
    ...current,
    connections: [{ source: 'sandbox-1', target: 'sandbox-2', intent: 'DROP TABLE' }],
  };
  expect(() => parseSandboxDocument(JSON.stringify(bad), projectSignature(graph))).toThrow(
    'Unsupported connection intent',
  );
});

test('preserves custom component presets across export and import without changing simulation kinds', () => {
  const withPresets = {
    ...example(),
    nodes: [
      { ...example().nodes[0]!, label: 'Renamed application', preset: 'app-server' },
      { ...example().nodes[1]!, preset: 'cache' },
    ],
  };
  const restored = parseSandboxDocument(
    serializeSandboxDocument(withPresets),
    projectSignature(graph),
  );
  expect(restored.nodes[0]?.preset).toBe('app-server');
  expect(restored.nodes[0]?.label).toBe('Renamed application');
  expect(restored.nodes[1]?.preset).toBe('cache');
  expect(restored.nodes.map((node) => node.kind)).toEqual(['service', 'cache']);
});

test('rejects invalid or mismatched imported component presets', () => {
  const current = example();
  for (const preset of ['not-a-component', 'database']) {
    const malformed = {
      ...current,
      nodes: [{ ...current.nodes[0]!, preset }, current.nodes[1]!],
    };
    expect(() => parseSandboxDocument(JSON.stringify(malformed), projectSignature(graph))).toThrow(
      'Invalid proposed node',
    );
  }
});


test('version 1 workspaces without replica metadata restore with a single modeled instance', () => {
  const legacy = JSON.parse(JSON.stringify(example())) as { draft: { replicas?: Record<string, number> } };
  delete legacy.draft.replicas;
  const result = parseSandboxDocument(JSON.stringify(legacy), projectSignature(graph));
  expect(result.draft.replicas).toEqual({});
});

test('replica counts are validated and persist only for service processors', () => {
  const original = example();
  const valid = {
    ...original,
    nodes: [
      { ...original.nodes[0]!, preset: 'app-server' },
      original.nodes[1]!,
    ],
    draft: { ...original.draft, replicas: { 'sandbox-1': 3 } },
  };
  expect(parseSandboxDocument(serializeSandboxDocument(valid), projectSignature(graph)).draft.replicas)
    .toEqual({ 'sandbox-1': 3 });

  for (const count of [0, 1.5, 17]) {
    const malformed = { ...valid, draft: { ...valid.draft, replicas: { 'sandbox-1': count } } };
    expect(() => serializeSandboxDocument(malformed)).toThrow();
  }

  const cacheReplicas = { ...valid, draft: { ...valid.draft, replicas: { 'sandbox-2': 3 } } };
  expect(() => serializeSandboxDocument(cacheReplicas)).toThrow('service processors');
});
