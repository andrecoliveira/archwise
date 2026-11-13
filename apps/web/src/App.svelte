<script lang="ts">
  import { onMount } from 'svelte';
  import ArchitectureCanvas from './ArchitectureCanvas.svelte';
  import { isGraph, type Graph } from './graph-types.js';
  import './studio.css';

  type LoadState =
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ready'; graph: Graph };

  let state: LoadState = $state({ status: 'loading' });
  let selectedId: string | null = $state(null);
  let filter = $state('');
  let controller: AbortController | null = null;

  const graph = $derived(state.status === 'ready' ? state.graph : null);
  const visible = $derived(
    graph?.nodes.filter((node) =>
      `${node.label} ${node.framework ?? ''} ${node.id}`.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [],
  );
  const visibleIds = $derived(new Set(visible.map((node) => node.id)));
  const selected = $derived(graph?.nodes.find((node) => node.id === selectedId) ?? null);

  async function loadGraph() {
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    state = { status: 'loading' };
    try {
      const response = await fetch('/api/v1/graph', {
        credentials: 'same-origin',
        signal,
      });
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? 'Local session expired. Restart Archwise.'
            : `Local API returned HTTP ${response.status}.`,
        );
      }
      const payload: unknown = await response.json();
      if (!isGraph(payload)) throw new Error('Unsupported graph format.');
      if (!signal.aborted) state = { status: 'ready', graph: payload };
    } catch (error) {
      if (!signal.aborted) {
        state = { status: 'error', message: error instanceof Error ? error.message : 'Unable to load graph.' };
      }
    }
  }

  onMount(() => {
    void loadGraph();
    return () => controller?.abort();
  });
</script>

<svelte:head><title>Archwise — Architecture Studio</title></svelte:head>
<div class="studio">
  <header>
    <strong>⬡ Archwise <small>Architecture Studio</small></strong>
    <small>● Local · Read-only project inspection</small>
  </header>
  <main>
    <aside aria-label="Architecture navigation">
      <h1>Discovered architecture</h1>
      <p>Packages verified from local manifests.</p>
      <label for="component-filter">Filter components</label>
      <input id="component-filter" type="search" bind:value={filter} placeholder="Name or framework" />
      {#if graph}
        <p>{visible.length} of {graph.nodes.length} packages</p>
      {/if}
      <nav aria-label="Components">
        {#each visible as node (node.id)}
          <button
            type="button"
            class="node-item"
            class:active={selectedId === node.id}
            onclick={() => (selectedId = node.id)}
          >{node.label}</button>
        {/each}
      </nav>
      <p>Explore the discovered architecture or add hypothetical components in Sandbox.</p>
    </aside>
    <section class="workspace" aria-label="Architecture workspace">
      <div class="workspace-header">
        <div>
          <h1>System Design</h1>
          <p>Declared package dependencies are not verified production traffic.</p>
        </div>
        <button type="button" onclick={() => void loadGraph()}>Refresh graph</button>
      </div>
      {#if state.status === 'loading'}
        <div class="alert" role="status">Discovering architecture…</div>
      {:else if state.status === 'error'}
        <div class="alert" role="alert">{state.message} <button type="button" onclick={() => void loadGraph()}>Retry</button></div>
      {:else if graph && graph.nodes.length === 0}
        <div class="alert">No package manifests found in this workspace.</div>
      {:else if graph}
        <ArchitectureCanvas {graph} {visibleIds} bind:selectedId />
      {/if}
      {#if graph && graph.diagnostics.length > 0}
        <details><summary>{graph.diagnostics.length} scan diagnostics</summary>
          <ul>{#each graph.diagnostics as diagnostic, i (i)}<li>{diagnostic}</li>{/each}</ul>
        </details>
      {/if}
    </section>
    <aside aria-label="Component inspector">
      <h1>Inspector</h1>
      {#if selected}
        <h2>{selected.label}</h2>
        <p>Discovered · Manifest evidence</p>
        <p>Framework: {selected.framework ?? 'Not identified'}</p>
        <p>Internal dependencies: {graph?.edges.filter((edge) => edge.source === selected.id).length ?? 0}</p>
        <h2>Evidence</h2>
        <ul>{#each selected.evidence as item (`${item.path}:${item.kind}`)}
          <li><code>{item.path}</code> <small>{item.kind}</small></li>
        {/each}</ul>
      {:else if selectedId?.startsWith('sandbox-')}
        <h2>Hypothetical component</h2>
        <p>This component exists only in Sandbox; it does not modify repository files.</p>
      {:else}
        <p>Select a component to inspect its source evidence.</p>
      {/if}
    </aside>
  </main>
</div>
