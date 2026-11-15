import { expect, test } from 'vitest';
import { simulateSandbox, type SimulationScenario } from './simulation.js';

const scenario: SimulationScenario = {
  entryNodeId: 'sandbox-api',
  incomingRps: 100,
  components: [
    { id: 'sandbox-db', label: 'Database', kind: 'database', capacityRps: 40, baseLatencyMs: 20 },
    { id: 'sandbox-api', label: 'API', kind: 'service', capacityRps: 80, baseLatencyMs: 10 },
  ],
  connections: [{ source: 'sandbox-api', target: 'sandbox-db' }],
};

test('propagates throughput through a proposed DAG and reports capacity drops', () => {
  const report = simulateSandbox(scenario);
  expect(report.nodes.find((node) => node.id === 'sandbox-api')?.droppedRps).toBe(20);
  expect(report.nodes.find((node) => node.id === 'sandbox-db')?.incomingRps).toBe(80);
  expect(report.nodes.find((node) => node.id === 'sandbox-db')?.droppedRps).toBe(40);
  expect(report.exitRps).toBe(40);
  expect(report.bottlenecks).toEqual(['sandbox-api', 'sandbox-db']);
});

test('applies cache hits locally and does not invent production metrics', () => {
  const report = simulateSandbox({
    ...scenario,
    entryNodeId: 'sandbox-cache',
    incomingRps: 100,
    components: [
      {
        id: 'sandbox-cache',
        label: 'Cache',
        kind: 'cache',
        capacityRps: 120,
        baseLatencyMs: 3,
        cacheHitRate: 0.8,
      },
      { id: 'sandbox-db', label: 'Database', kind: 'database', capacityRps: 40, baseLatencyMs: 20 },
    ],
    connections: [{ source: 'sandbox-cache', target: 'sandbox-db' }],
  });
  expect(report.nodes.find((node) => node.id === 'sandbox-db')?.incomingRps).toBe(20);
  expect(report.exitRps).toBe(100);
  expect(report.assumptions.join(' ')).toContain('hypothetical');
});

test('failure reduces delivered load without mutating model inputs', () => {
  const frozen = structuredClone(scenario);
  const report = simulateSandbox({
    ...scenario,
    components: scenario.components.map((node) =>
      node.id === 'sandbox-db' ? { ...node, failed: true } : node,
    ),
  });
  expect(report.nodes.find((node) => node.id === 'sandbox-db')?.servedRps).toBe(0);
  expect(report.exitRps).toBe(0);
  expect(scenario).toEqual(frozen);
});

test('is deterministic regardless of component or connection input order', () => {
  expect(simulateSandbox(scenario)).toEqual(
    simulateSandbox({
      ...scenario,
      components: [...scenario.components].reverse(),
      connections: [...scenario.connections].reverse(),
    }),
  );
});

test('rejects discovered nodes, cyclic topology, duplicates and invalid numeric inputs', () => {
  expect(() => simulateSandbox({ ...scenario, incomingRps: Number.NaN })).toThrow('finite number');
  expect(() =>
    simulateSandbox({
      ...scenario,
      components: [
        {
          id: 'package:package.json',
          label: 'Discovered',
          kind: 'service',
          capacityRps: 100,
          baseLatencyMs: 10,
        },
      ],
    }),
  ).toThrow('Only explicitly proposed');
  expect(() =>
    simulateSandbox({
      ...scenario,
      connections: [
        { source: 'sandbox-api', target: 'sandbox-db' },
        { source: 'sandbox-db', target: 'sandbox-api' },
      ],
    }),
  ).toThrow('acyclic');
  expect(() =>
    simulateSandbox({
      ...scenario,
      connections: [...scenario.connections, ...scenario.connections],
    }),
  ).toThrow('Duplicate');
  expect(() =>
    simulateSandbox({
      ...scenario,
      connections: [{ source: 'package:web', target: 'sandbox-db' }],
    }),
  ).toThrow('proposed components');
});

test('distributes traffic across branches without counting fan-out as duplicated client requests', () => {
  const report = simulateSandbox({
    ...scenario,
    components: [
      scenario.components[1]!,
      { id: 'sandbox-a', label: 'A', kind: 'service', capacityRps: 100, baseLatencyMs: 2 },
      { id: 'sandbox-b', label: 'B', kind: 'service', capacityRps: 100, baseLatencyMs: 2 },
    ],
    connections: [
      { source: 'sandbox-api', target: 'sandbox-b' },
      { source: 'sandbox-api', target: 'sandbox-a' },
    ],
  });
  expect(report.nodes.find((node) => node.id === 'sandbox-a')?.incomingRps).toBe(40);
  expect(report.nodes.find((node) => node.id === 'sandbox-b')?.incomingRps).toBe(40);
  expect(report.exitRps).toBe(80);
});
