/**
 * Local-only, deterministic load model for explicitly proposed Sandbox components.
 *
 * This is a teaching approximation, NOT a runtime observation or an SRE forecast.
 * Discovered package dependencies are intentionally excluded.
 */
export type SimulatedKind = 'service' | 'cache' | 'database' | 'queue';

export interface ProposedComponent {
  readonly id: string;
  readonly label: string;
  readonly kind: SimulatedKind;
  readonly capacityRps: number;
  readonly baseLatencyMs: number;
  readonly cacheHitRate?: number;
  readonly failed?: boolean;
}

export interface ProposedConnection {
  readonly source: string;
  readonly target: string;
}

export interface SimulationScenario {
  readonly entryNodeId: string;
  readonly incomingRps: number;
  readonly components: readonly ProposedComponent[];
  readonly connections: readonly ProposedConnection[];
}

export interface SimulatedNodeResult {
  readonly id: string;
  readonly label: string;
  readonly kind: SimulatedKind;
  readonly incomingRps: number;
  readonly servedRps: number;
  readonly droppedRps: number;
  readonly downstreamRps: number;
  readonly utilization: number;
  readonly estimatedLatencyMs: number | null;
  readonly failed: boolean;
}

export interface SimulationReport {
  readonly model: 'deterministic-capacity-v1';
  readonly entryNodeId: string;
  readonly inputRps: number;
  readonly exitRps: number;
  readonly nodes: readonly SimulatedNodeResult[];
  readonly bottlenecks: readonly string[];
  readonly assumptions: readonly string[];
}

const MAX_COMPONENTS = 100;
const MAX_CONNECTIONS = 300;
const MAX_INPUT_RPS = 1_000_000;

function finiteBetween(value: number, min: number, max: number, name: string): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be a finite number between ${min} and ${max}.`);
  }
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Edges distribute a component's outgoing traffic equally; they are not
 * measured production calls. Cyclic graphs are rejected to keep the model
 * explicit and comprehensible.
 */
export function simulateSandbox(scenario: SimulationScenario): SimulationReport {
  finiteBetween(scenario.incomingRps, 0, MAX_INPUT_RPS, 'Incoming load');
  if (scenario.components.length === 0 || scenario.components.length > MAX_COMPONENTS) {
    throw new Error(`Sandbox must contain 1–${MAX_COMPONENTS} proposed components.`);
  }
  if (scenario.connections.length > MAX_CONNECTIONS) {
    throw new Error(`Sandbox supports at most ${MAX_CONNECTIONS} connections.`);
  }

  const components = new Map<string, ProposedComponent>();
  for (const node of scenario.components) {
    if (!node.id || components.has(node.id)) {
      throw new Error('Component IDs must be nonempty and unique.');
    }
    if (!node.id.startsWith('sandbox-')) {
      throw new Error('Only explicitly proposed Sandbox components may be simulated.');
    }
    finiteBetween(node.capacityRps, 0, MAX_INPUT_RPS, 'Component capacity');
    finiteBetween(node.baseLatencyMs, 0, 120_000, 'Base latency');
    if (node.kind === 'cache') {
      finiteBetween(node.cacheHitRate ?? 0, 0, 1, 'Cache hit rate');
    }
    components.set(node.id, node);
  }
  if (!components.has(scenario.entryNodeId)) {
    throw new Error('Choose a proposed Sandbox component as the entry point.');
  }

  const outgoing = new Map<string, string[]>();
  const incomingEdges = new Map<string, number>();
  for (const id of components.keys()) {
    outgoing.set(id, []);
    incomingEdges.set(id, 0);
  }
  const seenEdges = new Set<string>();
  for (const link of scenario.connections) {
    if (!components.has(link.source) || !components.has(link.target) || link.source === link.target) {
      throw new Error('Every simulated connection must link two different proposed components.');
    }
    const key = JSON.stringify([link.source, link.target]);
    if (seenEdges.has(key)) throw new Error('Duplicate Sandbox connection.');
    seenEdges.add(key);
    outgoing.get(link.source)!.push(link.target);
    incomingEdges.set(link.target, incomingEdges.get(link.target)! + 1);
  }
  // Stable topological ordering: output is independent of array ordering.
  const ready = [...components.keys()].filter((id) => incomingEdges.get(id) === 0).sort();
  const ordering: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift()!;
    ordering.push(id);
    for (const target of [...outgoing.get(id)!].sort()) {
      const remaining = incomingEdges.get(target)! - 1;
      incomingEdges.set(target, remaining);
      if (remaining === 0) {
        ready.push(target);
        ready.sort();
      }
    }
  }
  if (ordering.length !== components.size) {
    throw new Error('This simplified simulation requires an acyclic proposed topology.');
  }

  const input = new Map([...components.keys()].map((id) => [id, 0]));
  input.set(scenario.entryNodeId, scenario.incomingRps);
  const nodes: SimulatedNodeResult[] = [];
  let exitRps = 0;

  for (const id of ordering) {
    const node = components.get(id)!;
    const incomingRps = input.get(id)!;
    const capacity = node.failed ? 0 : node.capacityRps;
    const servedRps = Math.min(incomingRps, capacity);
    const droppedRps = incomingRps - servedRps;
    const utilization = capacity > 0 ? servedRps / capacity : incomingRps > 0 ? 1 : 0;
    const hitRate = node.kind === 'cache' ? (node.cacheHitRate ?? 0) : 0;
    // A cache hit is considered completed locally, not forwarded.
    const downstreamRps = servedRps * (1 - hitRate);
    const destinations = outgoing.get(id)!;
    if (destinations.length === 0) {
      exitRps += servedRps;
    } else {
      const share = downstreamRps / destinations.length;
      for (const target of destinations) {
        input.set(target, input.get(target)! + share);
      }
      exitRps += servedRps * hitRate;
    }
    nodes.push({
      id,
      label: node.label,
      kind: node.kind,
      incomingRps: round(incomingRps),
      servedRps: round(servedRps),
      droppedRps: round(droppedRps),
      downstreamRps: round(downstreamRps),
      utilization: round(utilization),
      estimatedLatencyMs:
        node.failed || (incomingRps > 0 && capacity === 0)
          ? null
          : round(node.baseLatencyMs * (1 + utilization * utilization * 2)),
      failed: node.failed === true,
    });
  }

  return {
    model: 'deterministic-capacity-v1',
    entryNodeId: scenario.entryNodeId,
    inputRps: round(scenario.incomingRps),
    exitRps: round(exitRps),
    nodes,
    bottlenecks: nodes.filter((node) => node.droppedRps > 0 || node.failed).map((node) => node.id),
    assumptions: [
      'Only explicitly added Sandbox nodes and links are simulated; discovered packages are excluded.',
      'Capacity, baseline latency, failure and cache-hit values are user-supplied hypothetical inputs.',
      'Traffic enters one selected proposed component and is divided equally across outgoing connections.',
      'Each component serves up to its configured capacity; excess traffic is counted as dropped (no retries).',
      'Cache hits terminate requests locally; misses proceed through outgoing links.',
      'Estimated per-node latency is baseLatency × (1 + 2 × utilization²); it is not observed or end-to-end latency.',
      'Cycles, concurrency, queue buffering, load balancing behavior and distributed retries are not modeled.',
    ],
  };
}
