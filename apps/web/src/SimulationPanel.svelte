<script lang="ts">
  import type { Edge, Node } from '@xyflow/svelte';
  import type { SimulationDraft } from './sandbox-persistence.js';
  import { canScaleComponent, modeledCapacityRps } from './replica-model.js';
  import { simulateSandbox, type SimulatedKind, type SimulationReport } from './simulation.js';
  import { captureScenario, compareScenarios, type ScenarioSnapshot } from './scenario-comparison.js';

  let { proposedNodes, proposedEdges, draft = $bindable() }: {
    proposedNodes: readonly Node[];
    proposedEdges: readonly Edge[];
    draft: SimulationDraft;
  } = $props();

  let snapshotError = $state<string | null>(null);
  const inputRps = $derived(draft.inputRps);
  const preferredEntryId = $derived(draft.preferredEntryId);
  const capacities = $derived(draft.capacities);
  const replicas = $derived(draft.replicas);
  const latencies = $derived(draft.latencies);
  const hitRates = $derived(draft.hitRates);
  const failed = $derived(draft.failed);
  const savedA = $derived(draft.savedA);
  const savedB = $derived(draft.savedB);

  const entryId = $derived(
    proposedNodes.some((node) => node.id === preferredEntryId)
      ? preferredEntryId
      : (proposedNodes[0]?.id ?? ''),
  );
  const connected = $derived(
    proposedEdges
      .filter(
        (edge) =>
          proposedNodes.some((node) => node.id === edge.source) &&
          proposedNodes.some((node) => node.id === edge.target),
      )
      .map((edge) => ({ source: edge.source, target: edge.target })),
  );
  const ignoredConnections = $derived(proposedEdges.length - connected.length);
  const components = $derived(
    proposedNodes.map((node) => {
      const kind = (node.data.kind ?? 'service') as SimulatedKind;
      return {
        id: node.id,
        label: typeof node.data.label === 'string' ? node.data.label : node.id,
        kind,
        capacityRps: modeledCapacityRps(kind, String(node.data.preset ?? ''), capacities[node.id] ?? 100, replicas[node.id]),
        baseLatencyMs: latencies[node.id] ?? 20,
        ...(kind === 'cache' ? { cacheHitRate: hitRates[node.id] ?? 0.5 } : {}),
        failed: failed[node.id] === true,
      };
    }),
  );
  const currentScenario = $derived({
    entryNodeId: entryId,
    incomingRps: inputRps,
    components,
    connections: connected,
  });

  const comparison = $derived(savedA && savedB ? compareScenarios(savedA, savedB) : null);

  function save(slot: 'A' | 'B'): void {
    try {
      const snapshot = captureScenario(slot, currentScenario);
      draft = { ...draft, [slot === 'A' ? 'savedA' : 'savedB']: snapshot };
      snapshotError = null;
    } catch (error) {
      snapshotError = error instanceof Error ? error.message : 'Unable to save scenario.';
    }
  }

  const outcome = $derived.by((): { report: SimulationReport | null; error: string | null } => {
    if (components.length === 0) return { report: null, error: null };
    try {
      return {
        report: simulateSandbox(currentScenario),
        error: null,
      };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : 'Simulation failed' };
    }
  });
</script>

<details class="simulation-panel">
  <summary>Simulation & A/B comparison <span class="simulation-summary-hint">· Expand to configure hypothetical traffic</span></summary>
  <p>No production metrics are collected. Only proposed components and links participate.</p>
  <section class="scenario-comparison" aria-label="Compare saved A and B scenarios">
    <div class="comparison-actions">
      <button type="button" disabled={!!outcome.error || !outcome.report} onclick={() => save('A')}>
        {savedA ? 'Replace A with current' : 'Save current as A'}
      </button>
      <button type="button" disabled={!!outcome.error || !outcome.report} onclick={() => save('B')}>
        {savedB ? 'Replace B with current' : 'Save current as B'}
      </button>
      <button type="button" disabled={!savedA && !savedB} onclick={() => { draft = { ...draft, savedA: null, savedB: null }; snapshotError = null; }}>
        Clear snapshots
      </button>
    </div>
    <p>
      Scenario A: {savedA ? `${savedA.scenario.components.length} nodes saved` : 'Not saved'} ·
      Scenario B: {savedB ? `${savedB.scenario.components.length} nodes saved` : 'Not saved'}.
      Snapshots are saved locally with the Sandbox and can be exported as JSON.
    </p>
    {#if snapshotError}
      <p class="simulation-error" role="alert">{snapshotError}</p>
    {/if}
    {#if comparison}
      <div class="comparison-results">
        <strong>A → B: {comparison.deliveredRpsDelta >= 0 ? '+' : ''}{comparison.deliveredRpsDelta.toFixed(1)} completed requests/second</strong>
        <p>
          Modeled output: A {comparison.baseline.exitRps.toFixed(1)} → B {comparison.candidate.exitRps.toFixed(1)} RPS.
          Input change: {comparison.inputRpsDelta >= 0 ? '+' : ''}{comparison.inputRpsDelta.toFixed(1)} RPS.
        </p>
        <p>New bottlenecks: {comparison.bottlenecksAdded.join(', ') || 'none'} ·
          Resolved bottlenecks: {comparison.bottlenecksRemoved.join(', ') || 'none'}</p>
        <table>
          <thead><tr><th>Component</th><th>Status</th><th>A served</th><th>B served</th><th>Δ served</th><th>Δ dropped</th></tr></thead>
          <tbody>
            {#each comparison.nodeChanges as item (item.id)}
              <tr>
                <td>{item.label}</td>
                <td>{item.change}</td>
                <td>{item.previousServedRps.toFixed(1)}</td>
                <td>{item.nextServedRps.toFixed(1)}</td>
                <td>{item.servedDeltaRps >= 0 ? '+' : ''}{item.servedDeltaRps.toFixed(1)}</td>
                <td>{item.droppedDeltaRps >= 0 ? '+' : ''}{item.droppedDeltaRps.toFixed(1)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <ul>{#each comparison.warnings as warning (warning)}<li>{warning}</li>{/each}</ul>
      </div>
    {/if}
  </section>
  {#if proposedNodes.length === 0}
    <p role="status">Add at least one proposed service to model a scenario.</p>
  {:else}
    <div class="scenario-fields">
      <label>
        Incoming load (requests/second)
        <input type="number" min="0" max="1000000" step="1" value={inputRps} oninput={(event) => (draft = { ...draft, inputRps: event.currentTarget.valueAsNumber })} />
      </label>
      <label>
        Entry component
        <select value={preferredEntryId} onchange={(event) => (draft = { ...draft, preferredEntryId: event.currentTarget.value })}>
          <option value="">First proposed component</option>
          {#each proposedNodes as node (node.id)}
            <option value={node.id}>{typeof node.data.label === 'string' ? node.data.label : node.id}</option>
          {/each}
        </select>
      </label>
    </div>
    <div class="simulation-components">
      {#each proposedNodes as node (node.id)}
        <div class="simulation-component">
          <strong>{typeof node.data.label === 'string' ? node.data.label : node.id}</strong>
          <small>{typeof node.data.kind === 'string' ? node.data.kind : 'service'}</small>
          <label>
            {canScaleComponent(node.data.kind as SimulatedKind, String(node.data.preset ?? '')) ? 'Capacity per replica (RPS)' : 'Capacity (requests/second)'}
            <input
              type="number"
              min="0"
              max="1000000"
              value={capacities[node.id] ?? 100}
              oninput={(event) =>
                (draft = { ...draft, capacities: { ...capacities, [node.id]: event.currentTarget.valueAsNumber } })}
            />
          </label>
          {#if canScaleComponent(node.data.kind as SimulatedKind, String(node.data.preset ?? ''))}
            <label>
              Replicas (1–16)
              <input type="number" min="1" max="16" step="1"
                value={replicas[node.id] ?? 1}
                onchange={(event) => {
                  const value = event.currentTarget.valueAsNumber;
                  if (Number.isInteger(value) && value >= 1 && value <= 16) {
                    draft = { ...draft, replicas: { ...replicas, [node.id]: value } };
                  }
                }} />
            </label>
            <small>Modeled total capacity: {modeledCapacityRps(
                node.data.kind as SimulatedKind, String(node.data.preset ?? ''),
                capacities[node.id] ?? 100, replicas[node.id]
              ).toFixed(0)} RPS · linear scaling assumption</small>
          {/if}
          <label>
            Baseline latency (ms)
            <input
              type="number"
              min="0"
              max="120000"
              value={latencies[node.id] ?? 20}
              oninput={(event) =>
                (draft = { ...draft, latencies: { ...latencies, [node.id]: event.currentTarget.valueAsNumber } })}
            />
          </label>
          {#if node.data.kind === 'cache'}
            <label>
              Cache hit rate (0–1)
              <input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={hitRates[node.id] ?? 0.5}
                oninput={(event) =>
                  (draft = { ...draft, hitRates: { ...hitRates, [node.id]: event.currentTarget.valueAsNumber } })}
              />
            </label>
          {/if}
          <label class="simulation-failure">
            <input
              type="checkbox"
              checked={failed[node.id] ?? false}
              onchange={(event) =>
                (draft = { ...draft, failed: { ...failed, [node.id]: event.currentTarget.checked } })}
            />
            Simulate failure
          </label>
        </div>
      {/each}
    </div>
    {#if ignoredConnections > 0}
      <p class="simulation-note" role="status">
        {ignoredConnections} proposed connection(s) touch discovered packages and are excluded from the model.
      </p>
    {/if}
    {#if outcome.error}
      <p role="alert" class="simulation-error">{outcome.error}</p>
    {:else if outcome.report}
      <div class="simulation-results" aria-label="Simulation results">
        <strong>Output: {outcome.report.exitRps.toFixed(1)} requests/second</strong>
        <p>Input: {outcome.report.inputRps.toFixed(1)} requests/second ·
          Bottlenecks: {outcome.report.bottlenecks.length}</p>
        <table>
          <thead>
            <tr><th>Component</th><th>Received</th><th>Served</th><th>Dropped</th><th>Utilization</th></tr>
          </thead>
          <tbody>
            {#each outcome.report.nodes as item (item.id)}
              <tr>
                <td>{item.label}</td>
                <td>{item.incomingRps.toFixed(1)}</td>
                <td>{item.servedRps.toFixed(1)}</td>
                <td>{item.droppedRps.toFixed(1)}</td>
                <td>{(item.utilization * 100).toFixed(0)}%</td>
              </tr>
            {/each}
          </tbody>
        </table>
        <details>
          <summary>Model assumptions and limitations</summary>
          <ul>{#each outcome.report.assumptions as assumption (assumption)}
            <li>{assumption}</li>
          {/each}</ul>
        </details>
      </div>
    {/if}
  {/if}
</details>
