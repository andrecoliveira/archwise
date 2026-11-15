import type { Graph } from './graph-types.js';
import { captureScenario, type ScenarioSnapshot } from './scenario-comparison.js';
import { simulateSandbox, type SimulatedKind } from './simulation.js';

export type SandboxNode = Readonly<{
  id: string;
  label: string;
  kind: SimulatedKind;
  x: number;
  y: number;
}>;

export type SandboxLink = Readonly<{
  source: string;
  target: string;
}>;

export interface SimulationDraft {
  readonly inputRps: number;
  readonly preferredEntryId: string;
  readonly capacities: Readonly<Record<string, number>>;
  readonly latencies: Readonly<Record<string, number>>;
  readonly hitRates: Readonly<Record<string, number>>;
  readonly failed: Readonly<Record<string, boolean>>;
  readonly savedA: ScenarioSnapshot | null;
  readonly savedB: ScenarioSnapshot | null;
}

export interface SandboxDocument {
  readonly format: 'archwise-sandbox';
  readonly version: 1;
  readonly projectSignature: string;
  readonly nodes: readonly SandboxNode[];
  readonly connections: readonly SandboxLink[];
  readonly draft: SimulationDraft;
}

const MAX_BYTES = 256 * 1024;
const ID_PATTERN = /^sandbox-[1-9][0-9]*$/;
const KINDS = new Set(['service', 'cache', 'database', 'queue']);
const MAX_RPS = 1_000_000;
const MAX_LATENCY = 120_000;

export function defaultSimulationDraft(): SimulationDraft {
  return {
    inputRps: 100,
    preferredEntryId: '',
    capacities: {},
    latencies: {},
    hitRates: {},
    failed: {},
    savedA: null,
    savedB: null,
  };
}

/** A stable project-scoped identifier, not a cryptographic security fingerprint. */
export function projectSignature(graph: Graph): string {
  const text = JSON.stringify({
    nodes: graph.nodes
      .map((node) => [node.id, node.evidence.map((item) => item.path).sort()])
      .sort(),
    edges: graph.edges.map((edge) => edge.id).sort(),
  });
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  }
  return `v1-${hash.toString(16).padStart(8, '0')}-${graph.nodes.length}-${graph.edges.length}`;
}

export function workspaceStorageKey(signature: string): string {
  return `archwise:sandbox:1:${signature}`;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

function numericMap(
  value: unknown,
  ids: ReadonlySet<string>,
  min: number,
  max: number,
): Record<string, number> {
  if (!record(value)) throw new Error('Invalid numeric settings.');
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!ids.has(key) || !numberBetween(entry, min, max)) {
      throw new Error('Invalid component numeric setting.');
    }
    result[key] = entry;
  }
  return result;
}

function booleanMap(value: unknown, ids: ReadonlySet<string>): Record<string, boolean> {
  if (!record(value)) throw new Error('Invalid failure settings.');
  const result: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!ids.has(key) || typeof entry !== 'boolean') {
      throw new Error('Invalid component failure setting.');
    }
    result[key] = entry;
  }
  return result;
}

function snapshot(value: unknown, slot: 'A' | 'B'): ScenarioSnapshot | null {
  if (value === null) return null;
  if (!record(value) || value.version !== 1 || value.slot !== slot || !record(value.scenario)) {
    throw new Error(`Invalid scenario ${slot} snapshot.`);
  }
  const scenario = value.scenario;
  if (
    typeof scenario.entryNodeId !== 'string' ||
    !numberBetween(scenario.incomingRps, 0, MAX_RPS) ||
    !Array.isArray(scenario.components) ||
    !Array.isArray(scenario.connections) ||
    scenario.components.length > 100 ||
    scenario.connections.length > 300
  ) {
    throw new Error(`Invalid scenario ${slot} inputs.`);
  }
  // Reject unknown object shapes before passing them to the deterministic engine.
  const components = scenario.components.map((item: unknown) => {
    if (
      !record(item) ||
      !ID_PATTERN.test(String(item.id)) ||
      typeof item.label !== 'string' ||
      item.label.length > 80 ||
      !KINDS.has(String(item.kind)) ||
      !numberBetween(item.capacityRps, 0, MAX_RPS) ||
      !numberBetween(item.baseLatencyMs, 0, MAX_LATENCY) ||
      (item.cacheHitRate !== undefined && !numberBetween(item.cacheHitRate, 0, 1)) ||
      (item.failed !== undefined && typeof item.failed !== 'boolean')
    ) {
      throw new Error(`Invalid scenario ${slot} component.`);
    }
    return {
      id: item.id as string,
      label: item.label,
      kind: item.kind as SimulatedKind,
      capacityRps: item.capacityRps as number,
      baseLatencyMs: item.baseLatencyMs as number,
      ...(item.cacheHitRate === undefined ? {} : { cacheHitRate: item.cacheHitRate as number }),
      ...(item.failed === undefined ? {} : { failed: item.failed as boolean }),
    };
  });
  const connections = scenario.connections.map((item: unknown) => {
    if (!record(item) || typeof item.source !== 'string' || typeof item.target !== 'string') {
      throw new Error(`Invalid scenario ${slot} connection.`);
    }
    return { source: item.source, target: item.target };
  });
  const checked = {
    entryNodeId: scenario.entryNodeId,
    incomingRps: scenario.incomingRps,
    components,
    connections,
  };
  simulateSandbox(checked);
  return captureScenario(slot, checked);
}

/** Validates size, version, project and every user-controlled field before restoration. */
export function parseSandboxDocument(text: string, signature: string): SandboxDocument {
  if (new TextEncoder().encode(text).length > MAX_BYTES) {
    throw new Error('Sandbox JSON exceeds the 256 KiB import limit.');
  }
  let input: unknown;
  try {
    input = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Sandbox file is not valid JSON.');
  }
  if (!record(input) || input.format !== 'archwise-sandbox' || input.version !== 1) {
    throw new Error('Unsupported Sandbox file format or version.');
  }
  if (input.projectSignature !== signature) {
    throw new Error('Sandbox belongs to a different discovered project.');
  }
  if (
    !Array.isArray(input.nodes) ||
    input.nodes.length > 100 ||
    !Array.isArray(input.connections) ||
    input.connections.length > 300
  ) {
    throw new Error('Sandbox topology exceeds the supported limits.');
  }
  const nodes: SandboxNode[] = input.nodes.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !ID_PATTERN.test(item.id) ||
      typeof item.label !== 'string' ||
      item.label.length > 80 ||
      !KINDS.has(String(item.kind)) ||
      !numberBetween(item.x, -1_000_000, 1_000_000) ||
      !numberBetween(item.y, -1_000_000, 1_000_000)
    ) {
      throw new Error('Invalid proposed node in Sandbox file.');
    }
    return {
      id: item.id,
      label: item.label,
      kind: item.kind as SimulatedKind,
      x: item.x,
      y: item.y,
    };
  });
  const ids = new Set(nodes.map((node) => node.id));
  if (ids.size !== nodes.length) throw new Error('Duplicate proposed nodes.');
  const seenLinks = new Set<string>();
  const connections: SandboxLink[] = input.connections.map((item: unknown) => {
    if (
      !record(item) ||
      typeof item.source !== 'string' ||
      typeof item.target !== 'string' ||
      !ids.has(item.source) ||
      !ids.has(item.target) ||
      item.source === item.target
    ) {
      throw new Error('Invalid proposed connection.');
    }
    const key = JSON.stringify([item.source, item.target]);
    if (seenLinks.has(key)) throw new Error('Duplicate proposed connection.');
    seenLinks.add(key);
    return { source: item.source, target: item.target };
  });
  if (
    !record(input.draft) ||
    !numberBetween(input.draft.inputRps, 0, MAX_RPS) ||
    typeof input.draft.preferredEntryId !== 'string' ||
    (input.draft.preferredEntryId !== '' && !ids.has(input.draft.preferredEntryId))
  ) {
    throw new Error('Invalid simulation input settings.');
  }
  const draft: SimulationDraft = {
    inputRps: input.draft.inputRps,
    preferredEntryId: input.draft.preferredEntryId,
    capacities: numericMap(input.draft.capacities, ids, 0, MAX_RPS),
    latencies: numericMap(input.draft.latencies, ids, 0, MAX_LATENCY),
    hitRates: numericMap(input.draft.hitRates, ids, 0, 1),
    failed: booleanMap(input.draft.failed, ids),
    savedA: snapshot(input.draft.savedA, 'A'),
    savedB: snapshot(input.draft.savedB, 'B'),
  };
  if (nodes.length > 0) {
    const model = {
      entryNodeId: draft.preferredEntryId || nodes[0]!.id,
      incomingRps: draft.inputRps,
      components: nodes.map((node) => ({
        id: node.id,
        label: node.label,
        kind: node.kind,
        capacityRps: draft.capacities[node.id] ?? 100,
        baseLatencyMs: draft.latencies[node.id] ?? 20,
        ...(node.kind === 'cache' ? { cacheHitRate: draft.hitRates[node.id] ?? 0.5 } : {}),
        failed: draft.failed[node.id] === true,
      })),
      connections,
    };
    simulateSandbox(model);
  } else if (connections.length > 0) {
    throw new Error('Connections require proposed nodes.');
  }
  return {
    format: 'archwise-sandbox',
    version: 1,
    projectSignature: signature,
    nodes,
    connections,
    draft,
  };
}

export function serializeSandboxDocument(document: SandboxDocument): string {
  return JSON.stringify(
    parseSandboxDocument(JSON.stringify(document), document.projectSignature),
    null,
    2,
  );
}
