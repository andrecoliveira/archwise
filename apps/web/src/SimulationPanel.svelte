<script lang="ts">
  import type { Edge, Node } from '@xyflow/svelte';
  import { simulateSandbox, type SimulatedKind, type SimulationReport } from './simulation.js';

  let { proposedNodes, proposedEdges }: {
    proposedNodes: readonly Node[];
    proposedEdges: readonly Edge[];
  } = $props();

  let inputRps = $state(100);
  let preferredEntryId = $state('');
  let capacities = $state<Record<string, number>>({});
  let latencies = $state<Record<string, number>>({});
  let hitRates = $state<Record<string, number>>({});
  let failed = $state<Record<string, boolean>>({});

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
        capacityRps: capacities[node.id] ?? 100,
        baseLatencyMs: latencies[node.id] ?? 20,
        cacheHitRate: kind === 'cache' ? (hitRates[node.id] ?? 0.5) : undefined,
        failed: failed[node.id] === true,
      };
    }),
  );
  const outcome = $derived.by((): { report: SimulationReport | null; error: string | null } => {
    if (components.length === 0) return { report: null, error: null };
    try {
      return {
        report: simulateSandbox({
          entryNodeId: entryId,
          incomingRps: inputRps,
          components,
          connections: connected,
        }),
        error: null,
      };
    } catch (error) {
      return { report: null, error: error instanceof Error ? error.message : 'Simulation failed' };
    }
  });
</script>

<details class="simulation-panel" open>
  <summary>Simulation — hypothetical estimates</summary>
  <p>No production metrics are collected. Only proposed components and links participate.</p>
  {#if proposedNodes.length === 0}
    <p role="status">Add at least one proposed service to model a scenario.</p>
  {:else}
    <div class="scenario-fields">
      <label>
        Incoming load (requests/second)
        <input type="number" min="0" max="1000000" step="1" bind:value={inputRps} />
      </label>
      <label>
        Entry component
        <select bind:value={preferredEntryId}>
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
            Capacity (requests/second)
            <input
              type="number"
              min="0"
              max="1000000"
              value={capacities[node.id] ?? 100}
              oninput={(event) =>
                (capacities = { ...capacities, [node.id]: event.currentTarget.valueAsNumber })}
            />
          </label>
          <label>
            Baseline latency (ms)
            <input
              type="number"
              min="0"
              max="120000"
              value={latencies[node.id] ?? 20}
              oninput={(event) =>
                (latencies = { ...latencies, [node.id]: event.currentTarget.valueAsNumber })}
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
                  (hitRates = { ...hitRates, [node.id]: event.currentTarget.valueAsNumber })}
              />
            </label>
          {/if}
          <label class="simulation-failure">
            <input
              type="checkbox"
              checked={failed[node.id] ?? false}
              onchange={(event) =>
                (failed = { ...failed, [node.id]: event.currentTarget.checked })}
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
