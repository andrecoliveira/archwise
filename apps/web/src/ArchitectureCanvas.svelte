<script lang="ts">
  import { Background, Controls, MiniMap, SvelteFlow, type Connection, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { onMount, untrack } from 'svelte';
  import { layoutNodes } from './graph-layout.js';
  import SimulationPanel from './SimulationPanel.svelte';
  import {
    defaultSimulationDraft,
    parseSandboxDocument,
    projectSignature,
    serializeSandboxDocument,
    workspaceStorageKey,
    type SimulationDraft,
    type SandboxDocument,
  } from './sandbox-persistence.js';
  import type { SimulatedKind } from './simulation.js';
  import type { Graph } from './graph-types.js';
  import {
    CONNECTION_INTENTS,
    CONNECTION_STYLES,
    explainConnection,
    suggestedIntent,
    type ConnectionIntent,
  } from './connection-intents.js';

  let { graph, visibleIds, selectedId = $bindable(null) }: {
    graph: Graph;
    visibleIds: Set<string>;
    selectedId: string | null;
  } = $props();

  type Mode = 'explore' | 'sandbox';
  let mode: Mode = $state('explore');
  let counter = $state(0);
  let newKind: SimulatedKind = $state('service');
  let newLabel = $state('');
  let selectedEdgeId = $state<string | null>(null);
  let connectionNotice = $state('');
  let proposedNodes: Node[] = $state.raw([]);
  let proposedEdges: Edge[] = $state.raw([]);
  let nodes: Node[] = $state.raw([]);
  let edges: Edge[] = $state.raw([]);
  let layoutNonce = $state(0);
  let layoutError: string | null = $state(null);
  let draft: SimulationDraft = $state.raw(defaultSimulationDraft());
  let storageReady = $state(false);
  let persistenceStatus = $state('');
  const signature = $derived(projectSignature(graph));

  function createDocument(): SandboxDocument {
    const ids = new Set(proposedNodes.map((node) => node.id));
    const validMap = <T,>(values: Readonly<Record<string, T>>): Record<string, T> =>
      Object.fromEntries(Object.entries(values).filter(([key]) => ids.has(key)));
    const document: SandboxDocument = {
      format: 'archwise-sandbox',
      version: 1,
      projectSignature: signature,
      nodes: proposedNodes.map((node) => {
        const current = nodes.find((item) => item.id === node.id);
        return {
          id: node.id,
          label: typeof node.data.label === 'string' ? node.data.label : node.id,
          kind: (node.data.kind ?? 'service') as SimulatedKind,
          x: current?.position.x ?? node.position.x,
          y: current?.position.y ?? node.position.y,
        };
      }),
      connections: proposedEdges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .map((edge) => ({
          source: edge.source,
          target: edge.target,
          ...(edge.data?.intent === undefined ? {} : { intent: edge.data.intent as ConnectionIntent }),
        })),
      draft: {
        ...draft,
        capacities: validMap(draft.capacities),
        latencies: validMap(draft.latencies),
        hitRates: validMap(draft.hitRates),
        failed: validMap(draft.failed),
        preferredEntryId: ids.has(draft.preferredEntryId) ? draft.preferredEntryId : '',
      },
    };
    return document;
  }

  function restoreDocument(document: SandboxDocument): void {
    const parsed = parseSandboxDocument(JSON.stringify(document), signature);
    proposedNodes = parsed.nodes.map((item) => ({
      id: item.id,
      type: 'default',
      position: { x: item.x, y: item.y },
      data: { label: item.label, kind: item.kind, origin: 'proposed' },
      style: 'border:2px dashed #0d9488;background:#0e3233;color:white;border-radius:8px;',
    }));
    proposedEdges = parsed.connections.map((edge, index) => ({
      id: `proposed-edge-${index + 1}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      data: { origin: 'proposed', intent: edge.intent ?? 'REQ' },
      label: edge.intent ?? 'REQ',
      labelStyle: 'fill:#e2e8f0;font-weight:700;',
      labelBgStyle: 'fill:#172238;',
      style: `stroke:${CONNECTION_STYLES[edge.intent ?? 'REQ'].color};stroke-width:2;`,
    }));
    counter = Math.max(
      0,
      parsed.connections.length,
      ...parsed.nodes.map((node) => Number(node.id.slice('sandbox-'.length))),
    );
    draft = parsed.draft;
    selectedId = null;
    selectedEdgeId = null;
    layoutNonce += 1;
  }

  function exportDocument(): void {
    try {
      const serialized = serializeSandboxDocument(createDocument());
      const blob = new Blob([serialized], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'archwise-sandbox-v1.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      persistenceStatus = 'Sandbox exported as a local JSON file.';
    } catch (error) {
      persistenceStatus = error instanceof Error ? error.message : 'Unable to export Sandbox.';
    }
  }

  async function importDocument(event: Event): Promise<void> {
    const control = event.currentTarget as HTMLInputElement;
    const file = control.files?.[0];
    if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error('Sandbox file exceeds the 256 KiB limit.');
      const imported = parseSandboxDocument(await file.text(), signature);
      restoreDocument(imported);
      mode = 'sandbox';
      persistenceStatus = 'Sandbox imported and restored locally.';
    } catch (error) {
      persistenceStatus = error instanceof Error ? error.message : 'Unable to import Sandbox.';
    } finally {
      control.value = '';
    }
  }

  onMount(() => {
    try {
      const raw = window.localStorage.getItem(workspaceStorageKey(signature));
      if (raw !== null) {
        restoreDocument(parseSandboxDocument(raw, signature));
        persistenceStatus = 'Previous Sandbox recovered from this browser.';
      }
    } catch (error) {
      persistenceStatus = error instanceof Error ? error.message : 'Local persistence unavailable.';
    } finally {
      storageReady = true;
    }
  });

  $effect(() => {
    if (!storageReady) return;
    try {
      window.localStorage.setItem(
        workspaceStorageKey(signature),
        serializeSandboxDocument(createDocument()),
      );
    } catch (error) {
      persistenceStatus = error instanceof Error ? error.message : 'Local persistence unavailable.';
    }
  });

  $effect(() => {
    const nonce = layoutNonce;
    const discoveredNodes: Node[] = graph.nodes
      .filter((item) => visibleIds.has(item.id))
      .map((item) => ({
        id: item.id,
        position: { x: 0, y: 0 },
        data: { label: `${item.label} · ${item.framework ?? 'Package'}` },
        type: 'default',
        draggable: true,
        style: 'border:1px solid #3b82f6;background:#13233c;color:#eaf2ff;border-radius:8px;',
      }));
    const visible = new Set(discoveredNodes.map((item) => item.id));
    const discoveredEdges: Edge[] = graph.edges
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'smoothstep',
        data: { origin: 'discovered' },
      }));
    const current = mode === 'sandbox' ? [...discoveredNodes, ...proposedNodes] : discoveredNodes;
    const links = mode === 'sandbox' ? [...discoveredEdges, ...proposedEdges] : discoveredEdges;
    const previous = new Map(untrack(() => nodes).map((item) => [item.id, item.position]));
    const positioned = current.map((item) => ({
      ...item,
      position: previous.get(item.id) ?? item.position,
    }));
    nodes = positioned;
    edges = links;
    let cancelled = false;
    void layoutNodes(positioned, links)
      .then((placed) => {
        if (!cancelled && nonce === layoutNonce) {
          nodes = placed;
          layoutError = null;
        }
      })
      .catch(() => {
        if (!cancelled) layoutError = 'Automatic layout failed. Drag nodes to position them manually.';
      });
    return () => { cancelled = true; };
  });

  function addNode() {
    counter += 1;
    const label = newLabel.trim().slice(0, 80) || `Proposed ${newKind}`;
    proposedNodes = [
      ...proposedNodes,
      {
        id: `sandbox-${counter}`,
        type: 'default',
        position: { x: 300, y: counter * 90 },
        data: { label, kind: newKind, origin: 'proposed' },
        style: 'border:2px dashed #0d9488;background:#0e3233;color:white;border-radius:8px;',
      },
    ];
    selectedId = `sandbox-${counter}`;
    newLabel = '';
  }

  function connect(connection: Connection) {
    if (mode !== 'sandbox' || !connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      connectionNotice = 'A component cannot connect to itself.';
      return;
    }
    const source = proposedNodes.find((node) => node.id === connection.source);
    const target = proposedNodes.find((node) => node.id === connection.target);
    if (!source || !target) {
      connectionNotice = 'Only proposed-to-proposed connections can be simulated and saved.';
      return;
    }
    if (proposedEdges.some((edge) => edge.source === connection.source && edge.target === connection.target)) {
      connectionNotice = 'This connection already exists.';
      return;
    }
    const intent = suggestedIntent(source.data.kind as SimulatedKind, target.data.kind as SimulatedKind);
    const id = `proposed-edge-${counter++}`;
    proposedEdges = [
      ...proposedEdges,
      {
        id,
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        data: { origin: 'proposed', intent },
        label: intent,
        labelStyle: 'fill:#e2e8f0;font-weight:700;',
        labelBgStyle: 'fill:#172238;',
        style: `stroke:${CONNECTION_STYLES[intent].color};stroke-width:2;`,
      },
    ];
    selectedEdgeId = id;
    connectionNotice = '';
  }

  const selectedEdge = $derived(proposedEdges.find((edge) => edge.id === selectedEdgeId));
  const selectedSource = $derived(proposedNodes.find((node) => node.id === selectedEdge?.source));
  const selectedTarget = $derived(proposedNodes.find((node) => node.id === selectedEdge?.target));
  const selectedIntent = $derived((selectedEdge?.data?.intent ?? 'REQ') as ConnectionIntent);
  const selectedWarning = $derived(
    selectedSource && selectedTarget
      ? explainConnection(
          selectedSource.data.kind as SimulatedKind,
          selectedTarget.data.kind as SimulatedKind,
          selectedIntent,
        )
      : null,
  );

  function updateIntent(intent: ConnectionIntent): void {
    if (!selectedEdgeId) return;
    proposedEdges = proposedEdges.map((edge) =>
      edge.id === selectedEdgeId
        ? {
            ...edge,
            data: { ...edge.data, intent },
            label: intent,
            style: `stroke:${CONNECTION_STYLES[intent].color};stroke-width:2;`,
          }
        : edge,
    );
  }

  function removeSelectedEdge(): void {
    if (!selectedEdgeId) return;
    proposedEdges = proposedEdges.filter((edge) => edge.id !== selectedEdgeId);
    selectedEdgeId = null;
  }

  function removeSelected() {
    if (!selectedId?.startsWith('sandbox-')) return;
    const removedId = selectedId;
    proposedNodes = proposedNodes.filter((node) => node.id !== removedId);
    proposedEdges = proposedEdges.filter((edge) => edge.source !== removedId && edge.target !== removedId);
    selectedId = null;
    selectedEdgeId = null;
  }
</script>

<div class="toolbar">
  <button type="button" aria-pressed={mode === 'explore'} onclick={() => { mode = 'explore'; selectedId = null; }}>Explore</button>
  <button type="button" aria-pressed={mode === 'sandbox'} onclick={() => { mode = 'sandbox'; selectedId = null; }}>Sandbox</button>
  <button type="button" onclick={() => (layoutNonce += 1)}>Auto layout</button>
  {#if mode === 'sandbox'}
    <label for="proposed-type">Component type</label>
    <select id="proposed-type" bind:value={newKind}>
      <option value="service">Service</option>
      <option value="cache">Cache</option>
      <option value="database">Database</option>
      <option value="queue">Queue (capacity-only)</option>
    </select>
    <input aria-label="Proposed component name" placeholder="Name (optional)" bind:value={newLabel} maxlength="80" />
    <button type="button" onclick={addNode}>Add proposed component</button>
    <button type="button" disabled={!selectedId?.startsWith('sandbox-')} onclick={removeSelected}>Remove selected</button>
    <button type="button" onclick={() => { proposedNodes = []; proposedEdges = []; draft = { ...defaultSimulationDraft(), savedA: draft.savedA, savedB: draft.savedB }; selectedId = null; }}>Reset sandbox</button>
    <button type="button" onclick={exportDocument}>Export JSON</button>
    <label for="sandbox-import">Import JSON</label>
    <input id="sandbox-import" type="file" accept=".json,application/json" onchange={importDocument} />
  {/if}
</div>
{#if mode === 'sandbox' && selectedEdge}
  <section class="connection-inspector" aria-label="Connection intent editor">
    <strong>Connection intent</strong>
    <span>{selectedSource?.data.label ?? selectedEdge.source} → {selectedTarget?.data.label ?? selectedEdge.target}</span>
    <label for="edge-intent">Intent</label>
    <select id="edge-intent" value={selectedIntent} onchange={(event) => updateIntent(event.currentTarget.value as ConnectionIntent)}>
      {#each CONNECTION_INTENTS as intent (intent)}
        <option value={intent}>{CONNECTION_STYLES[intent].label} · {CONNECTION_STYLES[intent].meaning}</option>
      {/each}
    </select>
    <button type="button" onclick={removeSelectedEdge}>Remove connection</button>
    <button type="button" onclick={() => (selectedEdgeId = null)}>Close</button>
    {#if selectedWarning}<p role="alert">{selectedWarning}</p>{/if}
    <small>Visual meaning only. Traffic is still split equally by the simplified simulation.</small>
  </section>
{/if}
{#if connectionNotice}<div class="persistence-status" role="status">{connectionNotice}</div>{/if}
<!-- Keep the panel mounted while Explore is active so A/B snapshots are retained in memory. -->
<div hidden={mode !== 'sandbox'}>
  <SimulationPanel {proposedNodes} {proposedEdges} bind:draft />
</div>
{#if persistenceStatus}
  <div class="persistence-status" role="status">{persistenceStatus}</div>
{/if}
{#if layoutError}<div role="alert" class="alert">{layoutError}</div>{/if}
<div class="viewport" role="region" aria-label="Interactive architecture graph">
  <SvelteFlow
    bind:nodes
    bind:edges
    fitView
    colorMode="dark"
    nodesDraggable
    nodesConnectable={mode === 'sandbox'}
    elementsSelectable
    deleteKey={null}
    minZoom={0.15}
    maxZoom={2}
    onnodeclick={({ node }) => { selectedId = node.id; selectedEdgeId = null; }}
    onedgeclick={({ edge }) => { selectedEdgeId = edge.data?.origin === "proposed" ? edge.id : null; }}
    onconnect={connect}
  >
    <Background />
    <MiniMap />
    <Controls />
  </SvelteFlow>
</div>
