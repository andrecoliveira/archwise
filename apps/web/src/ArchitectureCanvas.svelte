<script lang="ts">
  import { Background, Controls, MiniMap, SvelteFlow, MarkerType, type Connection, type Edge, type Node } from '@xyflow/svelte';
  import '@xyflow/svelte/dist/style.css';
  import { onMount, untrack } from 'svelte';
  import { layoutNodes } from './graph-layout.js';
  import { suggestedNodePosition } from './node-placement.js';
  import { canScaleComponent, modeledCapacityRps, replicaCount } from './replica-model.js';
  import { getCanvasFeedback } from './canvas-feedback.js';
  import { findCatalogComponent } from './component-catalog.js';
  import SimulationPanel from './SimulationPanel.svelte';
  import ArchitectureNode from './ArchitectureNode.svelte';
  import DiscoveredNode from './DiscoveredNode.svelte';
  import IsoNode from './IsoNode.svelte';
  import DiscoveredEdge from './DiscoveredEdge.svelte';
  import { focusSet } from './focus.js';
  import CanvasKeys from './CanvasKeys.svelte';
  import { canvasKeyAction } from './canvas-keys.js';
  import { NODE_SIZE, type NodeStyle } from './node-style.js';
  import { kindLabel } from './graph-types.js';
  import FitViewOnLayout from './FitViewOnLayout.svelte';
  import ArchitectureEdge from './ArchitectureEdge.svelte';
  import { validateProposedConnection, CONNECTION_HELP_TEXT } from './connection-validation.js';
  import {
    defaultSimulationDraft,
    parseSandboxDocument,
    projectSignature,
    serializeSandboxDocument,
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

  type Mode = 'explore' | 'sandbox';
  let {
    graph,
    view = null,
    visibleIds,
    selectedId = $bindable(null),
    mode = $bindable<Mode>('sandbox'),
    addRequest = null,
    initialDocument = null,
    onDocumentChange = () => {},
    onRestoreFailed = () => {},
    nodeStyle = 'cards',
  }: {
    /** The discovered graph; the Sandbox signature always hashes this full graph. */
    graph: Graph;
    /** What the canvas draws (the System view, for example); defaults to `graph`. */
    view?: Graph | null;
    visibleIds: Set<string>;
    selectedId: string | null;
    mode: Mode;
    addRequest: { id: number; preset: string } | null;
    /** Saved archwise-sandbox text restored once on mount (from the local session store). */
    initialDocument?: string | null;
    /** Receives the serialized Sandbox after every change, for autosave. */
    onDocumentChange?: (text: string) => void;
    /** Called when the saved Sandbox cannot be restored, so it is never overwritten. */
    onRestoreFailed?: (message: string) => void;
    /** Isometric pieces or flat cards (spec §4.3). */
    nodeStyle?: NodeStyle;
  } = $props();
  let counter = $state(0);
  // A remount (session switch) must not replay a catalog request the previous canvas handled.
  let lastHandledRequest = untrack(() => addRequest?.id ?? 0);
  let hasRequestedLayout = 0;
  let selectedEdgeId = $state<string | null>(null);
  let connectionNotice = $state('');
  let selectedNodeInsight = $state('');
  let proposedNodes: Node[] = $state.raw([]);
  let proposedEdges: Edge[] = $state.raw([]);
  let nodes: Node[] = $state.raw([]);
  let edges: Edge[] = $state.raw([]);
  let layoutNonce = $state(0);
  /** Bumped after each automatic layout in Explore, so the viewport refits. */
  let fitTrigger = $state(0);
  let layoutError: string | null = $state(null);
  let draft: SimulationDraft = $state.raw(defaultSimulationDraft());
  let storageReady = $state(false);
  let persistenceStatus = $state('');
  const signature = $derived(projectSignature(graph));
  const nodeTypes = { architecture: ArchitectureNode, discovered: DiscoveredNode, iso: IsoNode };
  const shown = $derived(view ?? graph);
  const edgeTypes = { semantic: ArchitectureEdge, discovered: DiscoveredEdge };
  let keys: CanvasKeys | null = $state(null);
  /** Canvas keys run in the capture phase so arrow keys pan the view and never move a node. */
  function onCanvasKey(event: KeyboardEvent): void {
    if (keys?.apply(canvasKeyAction(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  /** Focus decoration: dim what is not connected to the selection; animate only what is. */
  function decorate(list: Node[], links: Edge[], selected: string | null): { nodes: Node[]; edges: Edge[] } {
    const focus = focusSet(links.filter((edge) => edge.data?.origin === 'discovered'), selected);
    const inFocus = (id: string): boolean => focus === null || focus.nodes.has(id);
    return {
      nodes: list.map((item) =>
        item.type === 'iso' || item.type === 'discovered'
          ? { ...item, data: { ...item.data, dimmed: !inFocus(item.id), animated: inFocus(item.id) } }
          : item,
      ),
      edges: links.map((edge) =>
        edge.data?.origin === 'discovered'
          ? {
              ...edge,
              data: {
                ...edge.data,
                focused: focus?.edges.has(`${edge.source}->${edge.target}`) ?? false,
                dimmed: focus !== null && !focus.edges.has(`${edge.source}->${edge.target}`),
                animated: true,
              },
            }
          : edge,
      ),
    };
  }

  $effect(() => {
    const selected = mode === 'explore' ? selectedId : null;
    untrack(() => {
      const next = decorate(nodes, edges, selected);
      nodes = next.nodes;
      edges = next.edges;
    });
  });
  const selectedProposed = $derived(proposedNodes.find((node) => node.id === selectedId));
  const selectedPreset = $derived(findCatalogComponent(String(selectedProposed?.data.preset ?? '')));

  function renameSelected(value: string): void {
    if (!selectedProposed) return;
    const label = value.slice(0, 80);
    proposedNodes = proposedNodes.map((node) => node.id === selectedProposed.id
      ? { ...node, data: { ...node.data, label } } : node);
  }

  function updateNumeric(setting: 'capacities' | 'latencies' | 'hitRates', value: number): void {
    if (!selectedProposed || !Number.isFinite(value)) return;
    const max = setting === 'hitRates' ? 1 : setting === 'latencies' ? 120000 : 1000000;
    if (value < 0 || value > max) return;
    draft = { ...draft, [setting]: { ...draft[setting], [selectedProposed.id]: value } };
  }

  function updateReplicas(value: number): void {
    if (!selectedProposed || !Number.isInteger(value) || value < 1 || value > 16) return;
    draft = { ...draft, replicas: { ...draft.replicas, [selectedProposed.id]: value } };
  }

  function updateFailure(failed: boolean): void {
    if (!selectedProposed) return;
    draft = { ...draft, failed: { ...draft.failed, [selectedProposed.id]: failed } };
  }


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
          ...(typeof node.data.preset === 'string' ? { preset: node.data.preset } : {}),
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
        replicas: validMap(draft.replicas),
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
      type: 'architecture',
      position: { x: item.x, y: item.y },
      data: { label: item.label, kind: item.kind, origin: 'proposed', preset: item.preset ?? '' },
    }));
    proposedEdges = parsed.connections.map((edge, index) => ({
      id: `proposed-edge-${index + 1}`,
      source: edge.source,
      target: edge.target,
      type: 'semantic',
      markerEnd: { type: MarkerType.ArrowClosed, color: CONNECTION_STYLES[edge.intent ?? 'REQ'].color },
      interactionWidth: 28,
      data: { origin: 'proposed', intent: edge.intent ?? 'REQ' },
      label: edge.intent ?? 'REQ',
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
    const saved = untrack(() => initialDocument);
    try {
      if (saved !== null) {
        restoreDocument(parseSandboxDocument(saved, signature));
        persistenceStatus = 'Session restored from the local store.';
      }
    } catch (error) {
      persistenceStatus = `Saved session could not be restored: ${
        error instanceof Error ? error.message : 'invalid document'
      }`;
      untrack(() => onRestoreFailed(persistenceStatus));
    } finally {
      storageReady = true;
    }
  });

  // Every Sandbox change is reported upward; the Studio autosaves it to the local store.
  $effect(() => {
    if (!storageReady) return;
    const text = serializeSandboxDocument(createDocument());
    untrack(() => onDocumentChange(text));
  });

  const visualFeedback = $derived.by(() => {
    if (proposedNodes.length === 0) return new Map<string, { label: string; status: string; detail: string; utilization: number; droppedRps: number }>();
    const ids = new Set(proposedNodes.map((node) => node.id));
    const components = proposedNodes.map((node) => {
      const kind = (node.data.kind ?? 'service') as SimulatedKind;
      return {
        id: node.id,
        label: String(node.data.label ?? node.id),
        kind,
        capacityRps: modeledCapacityRps(kind, String(node.data.preset ?? ''), draft.capacities[node.id] ?? 100, draft.replicas[node.id]),
        baseLatencyMs: draft.latencies[node.id] ?? 20,
        ...(kind === 'cache' ? { cacheHitRate: draft.hitRates[node.id] ?? 0.5 } : {}),
        failed: draft.failed[node.id] === true,
      };
    });
    const connections = proposedEdges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map((edge) => ({ source: edge.source, target: edge.target }));
    const entryNodeId =
      draft.preferredEntryId && ids.has(draft.preferredEntryId)
        ? draft.preferredEntryId
        : proposedNodes[0]!.id;
    try {
      return new Map(getCanvasFeedback(components, connections, entryNodeId, draft.inputRps).map((item) => [item.id, item]));
    } catch {
      return new Map<string, { label: string; status: string; detail: string; utilization: number; droppedRps: number }>();
    }
  });

  $effect(() => {
    const selected = selectedId ? visualFeedback.get(selectedId) : undefined;
    selectedNodeInsight = selected?.detail ?? '';
  });

  $effect(() => {
    const nonce = layoutNonce;
    const pieces = nodeStyle === 'pieces';
    const discoveredNodes: Node[] = shown.nodes
      .filter((item) => visibleIds.has(item.id))
      .map((item) => ({
        id: item.id,
        position: { x: 0, y: 0 },
        data: { node: item, animated: true },
        type: pieces ? 'iso' : 'discovered',
        draggable: true,
        ariaLabel: `${item.label}, ${kindLabel(item.type)}, ${item.confidence}`,
      }));
    const visible = new Set(discoveredNodes.map((item) => item.id));
    const discoveredEdges: Edge[] = shown.edges
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: 'discovered',
        data: { origin: 'discovered', confidence: edge.confidence },
      }));
    const decoratedProposed = proposedNodes.map((node) => {
      const feedback = visualFeedback.get(node.id);
      const label = String(node.data.label ?? node.id);
      const preset = String(node.data.preset ?? '');
      const modeled = {
        status: feedback?.status ?? 'normal',
        utilization: feedback?.utilization ?? 0,
        droppedRps: feedback?.droppedRps ?? 0,
      };
      return {
        ...node,
        type: pieces ? 'iso' : 'architecture',
        ariaLabel: `${label}, ${findCatalogComponent(preset)?.name ?? 'component'}, proposed`,
        data: pieces
          ? { ...node.data, animated: true, proposed: { label, preset, ...modeled } }
          : {
              ...node.data,
              name: node.data.label,
              ...modeled,
              replicas: replicaCount(node.data.kind as SimulatedKind, preset, draft.replicas[node.id]),
            },
      };
    });
    const current = mode === 'sandbox' ? decoratedProposed : discoveredNodes;
    const links = mode === 'sandbox'
      ? proposedEdges.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            onSelect: (id: string) => {
              selectedId = null;
              selectedEdgeId = id;
            },
          },
        }))
      : discoveredEdges;
    const previous = new Map(untrack(() => nodes).map((item) => [item.id, item.position]));
    const positioned = current.map((item) => ({
      ...item,
      position: previous.get(item.id) ?? item.position,
    }));
    const decorated = decorate(positioned, links, untrack(() => (mode === 'explore' ? selectedId : null)));
    nodes = decorated.nodes;
    edges = decorated.edges;
    if (mode === 'sandbox') {
      if (nonce === hasRequestedLayout) return;
      hasRequestedLayout = nonce;
    }
    let cancelled = false;
    void layoutNodes(positioned, links, NODE_SIZE[nodeStyle])
      .then((placed) => {
        if (!cancelled && nonce === layoutNonce) {
          nodes = decorate(placed, untrack(() => edges), untrack(() => (mode === 'explore' ? selectedId : null))).nodes;
          if (mode === 'explore') fitTrigger += 1;
          if (mode === 'sandbox') {
            const positions = new Map(placed.map((item) => [item.id, item.position]));
            proposedNodes = proposedNodes.map((item) => ({ ...item, position: positions.get(item.id) ?? item.position }));
          }
          layoutError = null;
        }
      })
      .catch(() => {
        if (!cancelled) layoutError = 'Automatic layout failed. Drag nodes to position them manually.';
      });
    return () => { cancelled = true; };
  });

  // Switching mode (done from the App's tabs) drops the selected component and connection,
  // as the old in-canvas switch did: a Sandbox selection means nothing in Explore.
  let previousMode = untrack(() => mode);
  $effect(() => {
    const current = mode;
    untrack(() => {
      if (current === previousMode) return;
      previousMode = current;
      selectedId = null;
      selectedEdgeId = null;
    });
  });

  function addNode(preset: string): void {
    const item = findCatalogComponent(preset);
    if (!item) return;
    counter += 1;
    mode = 'sandbox';
    const id = `sandbox-${counter}`;
    const position = suggestedNodePosition(counter - 1, window.innerWidth);
    proposedNodes = [
      ...proposedNodes,
      {
        id,
        type: 'architecture',
        position,
        data: { label: item.name, kind: item.kind, origin: 'proposed', preset: item.id },
      },
    ];
    selectedId = id;
    selectedEdgeId = null;
    connectionNotice = `${item.name} added. Add another component, then click its output port and the next component’s input port to connect.`;
  }

  $effect(() => {
    const request = addRequest;
    if (!request || request.id === lastHandledRequest) return;
    lastHandledRequest = request.id;
    addNode(request.preset);
  });

  function rememberDragPosition(node: Node): void {
    if (mode !== 'sandbox' || !node.id.startsWith('sandbox-')) return;
    proposedNodes = proposedNodes.map((item) =>
      item.id === node.id ? { ...item, position: { ...node.position } } : item,
    );
  }

  function connect(connection: Connection): void {
    if (mode !== 'sandbox' || !connection.source || !connection.target) return;
    const validation = validateProposedConnection(
      connection.source, connection.target,
      new Set(proposedNodes.map((item) => item.id)),
      proposedEdges,
    );
    if (!validation.valid) {
      connectionNotice = validation.reason;
      return;
    }
    const source = proposedNodes.find((node) => node.id === connection.source)!;
    const target = proposedNodes.find((node) => node.id === connection.target)!;
    const intent = suggestedIntent(source.data.kind as SimulatedKind, target.data.kind as SimulatedKind);
    const id = `proposed-edge-${counter++}`;
    proposedEdges = [
      ...proposedEdges,
      {
        id,
        source: connection.source,
        target: connection.target,
        type: 'semantic',
        markerEnd: { type: MarkerType.ArrowClosed, color: CONNECTION_STYLES[intent].color },
        interactionWidth: 28,
        data: { origin: 'proposed', intent },
        label: intent,
        style: `stroke:${CONNECTION_STYLES[intent].color};stroke-width:2;`,
        ariaLabel: `${source.data.label} to ${target.data.label}: ${intent}`,
      },
    ];
    selectedId = null;
    selectedEdgeId = id;
    connectionNotice = `Connected ${source.data.label} → ${target.data.label} as ${intent}. Select the label to change it.`;
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
            markerEnd: { type: MarkerType.ArrowClosed, color: CONNECTION_STYLES[intent].color },
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

<div class="toolbar" aria-label="Studio controls">
  <button type="button" onclick={() => (layoutNonce += 1)}>Auto layout</button>
  {#if mode === 'sandbox'}
    <span class="toolbar-count">{proposedNodes.length} components · {proposedEdges.length} connections</span>
    <div class="toolbar-actions">
      <button type="button" disabled={!selectedId?.startsWith('sandbox-')}
        onclick={removeSelected}>Remove selected</button>
      <button type="button" disabled={proposedNodes.length === 0}
        onclick={() => { proposedNodes = []; proposedEdges = []; draft = { ...defaultSimulationDraft(), savedA: draft.savedA, savedB: draft.savedB }; selectedId = null; selectedEdgeId = null; }}>Clear canvas</button>
      <button type="button" onclick={exportDocument}>Export JSON</button>
      <label class="import-label" for="sandbox-import">Import JSON</label>
      <input id="sandbox-import" class="visually-hidden" type="file" accept=".json,application/json" onchange={importDocument} />
    </div>
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
    <small>{CONNECTION_HELP_TEXT[selectedIntent]} Connection types are descriptive only; modeled traffic still follows simplified equal splitting.</small>
  </section>
{/if}
{#if connectionNotice}<div class="persistence-status" role="status">{connectionNotice}</div>{/if}
{#if persistenceStatus}
  <div class="persistence-status" role="status">{persistenceStatus}</div>
{/if}
{#if layoutError}<div role="alert" class="alert">{layoutError}</div>{/if}
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="viewport" role="region" aria-label="Interactive architecture graph" tabindex="0"
  aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown + - 0 Enter" onkeydowncapture={onCanvasKey}>
  {#if mode === 'sandbox' && proposedNodes.length === 0}
    <div class="canvas-empty-state" role="status">
      <strong>Your canvas is ready</strong>
      <p>Choose a component from the left sidebar to start designing.</p>
      <p>Then click the green output port followed by the blue input port to connect them.</p>
    </div>
  {/if}
  <SvelteFlow
    {nodeTypes}
    {edgeTypes}
    bind:nodes
    bind:edges
    fitView
    colorMode="dark"
    nodesDraggable
    nodesConnectable={mode === 'sandbox'}
    elementsSelectable
    clickConnect
    deleteKey={null}
    minZoom={0.15}
    maxZoom={2}
    onnodeclick={({ node }) => { selectedId = node.id; selectedEdgeId = null; }}
    onnodedragstop={({ targetNode }) => { if (targetNode) rememberDragPosition(targetNode); }}
    onpaneclick={() => { selectedId = null; selectedEdgeId = null; connectionNotice = ''; }}
    onedgeclick={({ edge }) => { selectedId = null; selectedEdgeId = edge.data?.origin === "proposed" ? edge.id : null; }}
    onconnect={connect}
  >
    <Background />
    <MiniMap />
    <Controls />
    <FitViewOnLayout trigger={fitTrigger} />
    <CanvasKeys bind:this={keys} onSelect={(id) => { selectedId = id; selectedEdgeId = null; }} />
  </SvelteFlow>
  {#if mode === 'sandbox' && selectedProposed}
    <section class="floating-inspector" aria-label="Selected component properties">
      <div class="floating-inspector-heading">
        <div>
          <strong>{selectedPreset?.name ?? 'Component properties'}</strong>
          <small>Hypothetical · {selectedProposed.data.kind}</small>
        </div>
        <button type="button" aria-label="Close component inspector" onclick={() => (selectedId = null)}>×</button>
      </div>
      <label for="inspector-name">Name</label>
      <input id="inspector-name" maxlength="80" value={String(selectedProposed.data.label ?? '')}
        oninput={(event) => renameSelected(event.currentTarget.value)} />
      <label for="inspector-capacity">
        {canScaleComponent(selectedProposed.data.kind as SimulatedKind, String(selectedProposed.data.preset ?? ''))
          ? 'Capacity per replica (RPS)'
          : 'Capacity (requests/second)'}
      </label>
      <input id="inspector-capacity" type="number" min="0" max="1000000"
        value={draft.capacities[selectedProposed.id] ?? 100}
        onchange={(event) => updateNumeric('capacities', event.currentTarget.valueAsNumber)} />
      {#if canScaleComponent(selectedProposed.data.kind as SimulatedKind, String(selectedProposed.data.preset ?? ''))}
        <label for="inspector-replicas">Replicas (1–16)</label>
        <input id="inspector-replicas" type="number" min="1" max="16" step="1"
          value={draft.replicas[selectedProposed.id] ?? 1}
          onchange={(event) => updateReplicas(event.currentTarget.valueAsNumber)} />
        <p class="inspector-model-note">Aggregate modeled capacity:
          {modeledCapacityRps(selectedProposed.data.kind as SimulatedKind,
            String(selectedProposed.data.preset ?? ''),
            draft.capacities[selectedProposed.id] ?? 100,
            draft.replicas[selectedProposed.id]).toFixed(0)} RPS.
          Assumes linear scaling, not real-world balancing.</p>
      {/if}
      <label for="inspector-latency">Baseline latency (ms)</label>
      <input id="inspector-latency" type="number" min="0" max="120000"
        value={draft.latencies[selectedProposed.id] ?? 20}
        onchange={(event) => updateNumeric('latencies', event.currentTarget.valueAsNumber)} />
      {#if selectedProposed.data.kind === 'cache'}
        <label for="inspector-hit-rate">Cache hit rate (0–1)</label>
        <input id="inspector-hit-rate" type="number" min="0" max="1" step="0.05"
          value={draft.hitRates[selectedProposed.id] ?? 0.5}
          onchange={(event) => updateNumeric('hitRates', event.currentTarget.valueAsNumber)} />
      {/if}
      <label class="inspector-toggle">
        <input type="checkbox" checked={draft.failed[selectedProposed.id] === true}
          onchange={(event) => updateFailure(event.currentTarget.checked)} />
        Simulate failure
      </label>
      {#if selectedNodeInsight}
        <p class="inspector-model-note" role="status">{selectedNodeInsight}</p>
      {/if}
      <p class="inspector-model-note">Values are hypothetical. The simulation does not observe production traffic.</p>
      <button class="inspector-remove" type="button" onclick={removeSelected}>Remove component</button>
    </section>
  {/if}
</div>
<!-- Keep the simulation mounted when exploring, preserving A/B snapshots. -->
<div hidden={mode !== 'sandbox'} class="simulation-drawer">
  <SimulationPanel {proposedNodes} {proposedEdges} bind:draft />
</div>
