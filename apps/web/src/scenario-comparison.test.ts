import { expect, test } from 'vitest';
import { captureScenario, compareScenarios } from './scenario-comparison.js';
import type { SimulationScenario } from './simulation.js';

const original: SimulationScenario = {
  incomingRps: 100,
  entryNodeId: 'sandbox-api',
  components: [
    {
      id: 'sandbox-api',
      label: 'API',
      kind: 'service',
      capacityRps: 60,
      baseLatencyMs: 10,
    },
  ],
  connections: [],
};

test('captures independent input snapshots and survives subsequent edits', () => {
  const editable = {
    ...original,
    components: original.components.map((node) => ({ ...node })),
    connections: original.connections.map((edge) => ({ ...edge })),
  };
  const a = captureScenario('A', editable);
  editable.components[0]!.capacityRps = 200;
  expect(a.scenario.components[0]?.capacityRps).toBe(60);
  expect(original.components[0]?.capacityRps).toBe(60);
});

test('reports output and bottleneck changes for A vs B', () => {
  const a = captureScenario('A', original);
  const b = captureScenario('B', {
    ...original,
    components: [{ ...original.components[0]!, capacityRps: 120 }],
  });
  const result = compareScenarios(a, b);
  expect(result.baseline.exitRps).toBe(60);
  expect(result.candidate.exitRps).toBe(100);
  expect(result.deliveredRpsDelta).toBe(40);
  expect(result.bottlenecksRemoved).toEqual(['sandbox-api']);
  expect(result.nodeChanges[0]?.change).toBe('modified');
  expect(result.nodeChanges[0]?.droppedDeltaRps).toBe(-40);
});

test('identifies added and removed hypothetical nodes with deterministic order', () => {
  const a = captureScenario('A', original);
  const b = captureScenario('B', {
    ...original,
    entryNodeId: 'sandbox-cache',
    components: [
      {
        id: 'sandbox-cache',
        label: 'Cache',
        kind: 'cache',
        capacityRps: 120,
        baseLatencyMs: 2,
        cacheHitRate: 1,
      },
    ],
  });
  const result = compareScenarios(a, b);
  expect(result.nodeChanges.map((item) => [item.id, item.change])).toEqual([
    ['sandbox-api', 'removed'],
    ['sandbox-cache', 'added'],
  ]);
  expect(result.warnings.some((warning) => warning.includes('Entry components differ'))).toBe(true);
});

test('warns when load differs so changes are not incorrectly attributed to design', () => {
  const result = compareScenarios(
    captureScenario('A', original),
    captureScenario('B', { ...original, incomingRps: 500 }),
  );
  expect(result.inputRpsDelta).toBe(400);
  expect(result.warnings.some((warning) => warning.includes('Incoming loads differ'))).toBe(true);
});

test('rejects invalid topologies, discovered nodes and reversed slots', () => {
  expect(() =>
    captureScenario('A', {
      ...original,
      components: [{ ...original.components[0]!, id: 'package:api' }],
    }),
  ).toThrow('Only explicitly proposed');
  const a = captureScenario('A', original);
  const b = captureScenario('B', original);
  expect(() => compareScenarios(b, a)).toThrow('Expected version 1');
});

test('a saved snapshot compares repeatably even when the source arrays change', () => {
  const a = captureScenario('A', original);
  const b = captureScenario('B', {
    ...original,
    components: [{ ...original.components[0]!, capacityRps: 120 }],
  });
  expect(compareScenarios(a, b)).toEqual(compareScenarios(a, b));
});
