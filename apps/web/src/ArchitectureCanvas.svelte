<script lang="ts">
  import { Background, Controls, MiniMap, SvelteFlow, type Connection, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { untrack } from 'svelte';
  import { layoutNodes } from './graph-layout.js';
  import type { Graph } from './graph-types.js';

  let { graph, visibleIds, selectedId = $bindable(null) }: {
    graph: Graph;
    visibleIds: Set<string>;
    selectedId: string | null;
  } = $props();

  type Mode = 'explore' | 'sandbox';
  let mode: Mode = $state('explore');
  let counter = $state(0);
  let proposedNodes: Node[] = $state.raw([]);
  let proposedEdges: Edge[] = $state.raw([]);
  let nodes: Node[] = $state.raw([]);
  let edges: Edge[] = $state.raw([]);
  let layoutNonce = $state(0);
  let layoutError: string | null = $state(null);

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
    proposedNodes = [
      ...proposedNodes,
      {
        id: `sandbox-${counter}`,
        type: 'default',
        position: { x: 300, y: counter * 90 },
        data: { label: 'Proposed service (hypothetical)' },
        style: 'border:2px dashed #0d9488;background:#0e3233;color:white;border-radius:8px;',
      },
    ];
    selectedId = `sandbox-${counter}`;
  }

  function connect(connection: Connection) {
    if (mode !== 'sandbox' || !connection.source || !connection.target) return;
    if (connection.source === connection.target) return;
    if (!connection.source.startsWith('sandbox-') && !connection.target.startsWith('sandbox-')) return;
    if (edges.some((edge) => edge.source === connection.source && edge.target === connection.target)) return;
    proposedEdges = [
      ...proposedEdges,
      {
        id: `proposed-edge-${counter++}`,
        source: connection.source,
        target: connection.target,
        type: 'smoothstep',
        data: { origin: 'proposed' },
        style: 'stroke:#0d9488;stroke-dasharray:6 4;',
      },
    ];
  }

  function removeSelected() {
    if (!selectedId?.startsWith('sandbox-')) return;
    proposedNodes = proposedNodes.filter((node) => node.id !== selectedId);
    proposedEdges = proposedEdges.filter((edge) => edge.source !== selectedId && edge.target !== selectedId);
    selectedId = null;
  }
</script>

<div class="toolbar">
  <button type="button" aria-pressed={mode === 'explore'} onclick={() => { mode = 'explore'; selectedId = null; }}>Explore</button>
  <button type="button" aria-pressed={mode === 'sandbox'} onclick={() => { mode = 'sandbox'; selectedId = null; }}>Sandbox</button>
  <button type="button" onclick={() => (layoutNonce += 1)}>Auto layout</button>
  {#if mode === 'sandbox'}
    <button type="button" onclick={addNode}>Add proposed service</button>
    <button type="button" disabled={!selectedId?.startsWith('sandbox-')} onclick={removeSelected}>Remove selected</button>
    <button type="button" onclick={() => { proposedNodes = []; proposedEdges = []; selectedId = null; }}>Reset sandbox</button>
  {/if}
</div>
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
    deleteKeyCode={null}
    minZoom={0.15}
    maxZoom={2}
    onnodeclick={({ node }) => { selectedId = node.id; }}
    onconnect={connect}
  >
    <Background />
    <MiniMap />
    <Controls />
  </SvelteFlow>
</div>
