import {
  simulateSandbox,
  type ProposedComponent,
  type ProposedConnection,
  type SimulationReport,
  type SimulationScenario,
} from './simulation.js';

/** In-memory snapshots: copies of hypothetical inputs, never discovered architecture. */
export interface ScenarioSnapshot {
  readonly version: 1;
  readonly slot: 'A' | 'B';
  readonly scenario: SimulationScenario;
}

export interface NodeDelta {
  readonly id: string;
  readonly label: string;
  readonly change: 'added' | 'removed' | 'modified' | 'unchanged';
  readonly previousServedRps: number;
  readonly nextServedRps: number;
  readonly servedDeltaRps: number;
  readonly previousDroppedRps: number;
  readonly nextDroppedRps: number;
  readonly droppedDeltaRps: number;
}

export interface ScenarioComparison {
  readonly baseline: SimulationReport;
  readonly candidate: SimulationReport;
  readonly inputRpsDelta: number;
  readonly deliveredRpsDelta: number;
  readonly bottlenecksAdded: readonly string[];
  readonly bottlenecksRemoved: readonly string[];
  readonly nodeChanges: readonly NodeDelta[];
  readonly warnings: readonly string[];
}

const delta = (previous: number, next: number): number =>
  Math.round((next - previous) * 1_000_000) / 1_000_000;

/**
 * Revalidate using the same deterministic model before preserving inputs.
 * Avoid referencing reactive arrays so later Sandbox edits cannot change A/B.
 */
export function captureScenario(slot: 'A' | 'B', scenario: SimulationScenario): ScenarioSnapshot {
  simulateSandbox(scenario);
  const components: ProposedComponent[] = scenario.components.map((node) => ({ ...node }));
  const connections: ProposedConnection[] = scenario.connections.map((edge) => ({ ...edge }));
  return {
    version: 1,
    slot,
    scenario: {
      entryNodeId: scenario.entryNodeId,
      incomingRps: scenario.incomingRps,
      components,
      connections,
    },
  };
}

/** Compare equivalent model versions; no runtime predictions or production benchmarks. */
export function compareScenarios(
  baselineSnapshot: ScenarioSnapshot,
  candidateSnapshot: ScenarioSnapshot,
): ScenarioComparison {
  if (
    baselineSnapshot.version !== 1 ||
    candidateSnapshot.version !== 1 ||
    baselineSnapshot.slot !== 'A' ||
    candidateSnapshot.slot !== 'B'
  ) {
    throw new Error('Expected version 1 snapshots A and B.');
  }
  const baseline = simulateSandbox(baselineSnapshot.scenario);
  const candidate = simulateSandbox(candidateSnapshot.scenario);
  const previousNodes = new Map(baseline.nodes.map((item) => [item.id, item]));
  const nextNodes = new Map(candidate.nodes.map((item) => [item.id, item]));
  const previousConfig = new Map(baselineSnapshot.scenario.components.map((item) => [item.id, item]));
  const nextConfig = new Map(candidateSnapshot.scenario.components.map((item) => [item.id, item]));
  const oldLinks = baselineSnapshot.scenario.connections;
  const newLinks = candidateSnapshot.scenario.connections;
  const linksFor = (id: string, links: readonly ProposedConnection[]): string[] =>
    links
      .filter((link) => link.source === id || link.target === id)
      .map((link) => JSON.stringify([link.source, link.target]))
      .sort();
  const nodeChanges: NodeDelta[] = [...new Set([...previousNodes.keys(), ...nextNodes.keys()])]
    .sort()
    .map((id) => {
      const previous = previousNodes.get(id);
      const next = nextNodes.get(id);
      const oldConfig = previousConfig.get(id);
      const newConfig = nextConfig.get(id);
      const before = previous?.servedRps ?? 0;
      const after = next?.servedRps ?? 0;
      const beforeDrop = previous?.droppedRps ?? 0;
      const afterDrop = next?.droppedRps ?? 0;
      const changed =
        JSON.stringify(oldConfig) !== JSON.stringify(newConfig) ||
        JSON.stringify(linksFor(id, oldLinks)) !== JSON.stringify(linksFor(id, newLinks)) ||
        before !== after ||
        beforeDrop !== afterDrop;
      return {
        id,
        label: next?.label ?? previous?.label ?? id,
        change: !previous ? 'added' : !next ? 'removed' : changed ? 'modified' : 'unchanged',
        previousServedRps: before,
        nextServedRps: after,
        servedDeltaRps: delta(before, after),
        previousDroppedRps: beforeDrop,
        nextDroppedRps: afterDrop,
        droppedDeltaRps: delta(beforeDrop, afterDrop),
      };
    });
  const oldBottlenecks = new Set(baseline.bottlenecks);
  const nextBottlenecks = new Set(candidate.bottlenecks);
  const warnings = [
    'Both scenarios are hypothetical; these deltas are not measurements or production forecasts.',
  ];
  if (baseline.inputRps !== candidate.inputRps) {
    warnings.push('Incoming loads differ; throughput changes cannot be attributed only to architecture.');
  }
  if (baseline.entryNodeId !== candidate.entryNodeId) {
    warnings.push('Entry components differ; request paths are not directly comparable.');
  }
  return {
    baseline,
    candidate,
    inputRpsDelta: delta(baseline.inputRps, candidate.inputRps),
    deliveredRpsDelta: delta(baseline.exitRps, candidate.exitRps),
    bottlenecksAdded: [...nextBottlenecks].filter((id) => !oldBottlenecks.has(id)).sort(),
    bottlenecksRemoved: [...oldBottlenecks].filter((id) => !nextBottlenecks.has(id)).sort(),
    nodeChanges,
    warnings,
  };
}
