<script lang="ts">
  import { onMount } from 'svelte';
  import ArchitectureCanvas from './ArchitectureCanvas.svelte';
  import SessionsPanel from './SessionsPanel.svelte';
  import { createAutosave, type Autosave, type AutosaveStatus } from './autosave.js';
  import {
    deleteSession,
    getCurrent,
    getSession,
    renameSession,
    resumeSession,
    saveSandbox,
    startNewSession,
  } from './session-client.js';
  import { chooseWorkspaceGraph } from './session-view.js';
  import { CATALOG_GROUPS, searchCatalog } from './component-catalog.js';
  import { getCoachQuestions } from './architecture-coach.js';
  import { isGraph, type Graph } from './graph-types.js';
  import './studio.css';

  let graphData = $state<Graph | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let selectedId: string | null = $state(null);
  let filter = $state('');
  let catalogFilter = $state('');
  let studioMode: 'explore' | 'sandbox' = $state('sandbox');
  let addRequest: { id: number; preset: string } | null = $state(null);
  let catalogCounter = 0;
  const filteredCatalog = $derived(searchCatalog(catalogFilter));
  function requestAdd(preset: string): void {
    catalogCounter += 1;
    studioMode = 'sandbox';
    addRequest = { id: catalogCounter, preset };
  }
  let controller: AbortController | null = null;

  // Session state: the local store autosaves the Sandbox of the current session.
  let sessionId: string | null = $state(null);
  let storeEnabled = $state(false);
  let initialDocument: string | null = $state(null);
  let historical = $state(false);
  let workspaceKey = $state(0);
  let sessionsOpen = $state(false);
  let saveStatus: AutosaveStatus = $state({ state: 'disabled', message: 'Connecting to the local store…' });
  let autosave: Autosave | null = null;

  function setupAutosave(id: string | null, enabled: boolean): void {
    autosave?.dispose();
    autosave = null;
    if (!enabled || id === null) {
      saveStatus = { state: 'disabled', message: 'Not saving (store disabled)' };
      return;
    }
    saveStatus = { state: 'saved', message: 'Changes save automatically' };
    autosave = createAutosave({
      save: (text, keepalive) => saveSandbox(id, text, fetch, { keepalive }),
      onStatus: (status) => (saveStatus = status),
      ignoreFirst: true,
    });
  }

  const graph = $derived(graphData);
  const visible = $derived(
    graph?.nodes.filter((node) =>
      `${node.label} ${node.framework ?? ''} ${node.id}`.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [],
  );
  const visibleIds = $derived(new Set(visible.map((node) => node.id)));
  const selected = $derived(graph?.nodes.find((node) => node.id === selectedId) ?? null);
  const coachQuestions = $derived(graph ? getCoachQuestions(graph, selectedId) : []);
  let questionIndex = $state(0);
  const currentQuestion = $derived(coachQuestions[questionIndex % Math.max(coachQuestions.length, 1)]);

  const UNSAVED_SWITCH =
    'Your latest changes are not saved yet. Retry saving, or export them as JSON, before switching.';
  let noticeError = $state('');

  async function loadGraph() {
    // Never drop an edit made just before a refresh or a session switch.
    if (autosave && !(await autosave.flush())) return;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    loading = true;
    loadError = null;
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
      const current = await getCurrent();
      let detail: { baseIsCurrent: boolean; view: unknown; sandbox: string } | null = null;
      if (current.ok && current.value.storeEnabled && current.value.persisted && current.value.id) {
        const loaded = await getSession(current.value.id);
        if (loaded.ok) detail = loaded.value;
      }
      if (!signal.aborted) {
        const chosen = chooseWorkspaceGraph(detail, payload);
        graphData = chosen.graph;
        historical = chosen.historical;
        initialDocument = detail?.sandbox ?? null;
        sessionId = current.ok ? current.value.id : null;
        storeEnabled = current.ok && current.value.storeEnabled;
        setupAutosave(sessionId, storeEnabled);
        workspaceKey += 1;
        loading = false;
      }
    } catch (error) {
      if (!signal.aborted) {
        loadError = error instanceof Error ? error.message : 'Unable to load graph.';
        loading = false;
      }
    }
  }

  /** Saves pending edits first so switching sessions never drops the last change. */
  async function switchSession(action: () => Promise<{ ok: boolean }>, failure: string): Promise<string | null> {
    if (autosave && !(await autosave.flush())) return UNSAVED_SWITCH;
    const result = await action();
    if (!result.ok) return failure;
    await loadGraph();
    return null;
  }

  const resume = (id: string) => switchSession(() => resumeSession(id), 'Unable to resume that session.');
  const startNew = () => switchSession(() => startNewSession(), 'Unable to start a new session.');

  async function remove(id: string): Promise<string | null> {
    const result = await deleteSession(id);
    if (!result.ok) return 'Unable to delete that session.';
    if (id === sessionId) await loadGraph();
    return null;
  }

  async function rename(id: string, label: string): Promise<string | null> {
    const result = await renameSession(id, label);
    if (result.ok) return null;
    if (result.status === 422) {
      return 'Use a name of 1–256 characters, without control characters or credential-like text.';
    }
    if (result.status === 404) return 'That session no longer exists.';
    return 'Unable to rename that session.';
  }

  async function startNewFromNotice(): Promise<void> {
    noticeError = (await startNew()) ?? '';
  }

  function restoreFailed(): void {
    autosave?.halt(
      'Saved session could not be restored, so changes are not saved. Start a new session from Sessions.',
    );
  }

  onMount(() => {
    void loadGraph();
    const flush = () => void autosave?.flush({ keepalive: true });
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      controller?.abort();
      autosave?.dispose();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<svelte:head><title>Archwise — Architecture Studio</title></svelte:head>
<div class="studio">
  <header>
    <strong>⬡ Archwise <small>Architecture Studio</small></strong>
    <div class="header-status">
      <span class="save-indicator" data-state={saveStatus.state} role="status" aria-live="polite">{saveStatus.message}</span>
      {#if saveStatus.state === 'unsaved' && !saveStatus.message.includes('Reload')}
        <button type="button" onclick={() => autosave?.retry()}>Retry</button>
      {/if}
      {#if storeEnabled}
        <button type="button" onclick={() => (sessionsOpen = !sessionsOpen)} aria-expanded={sessionsOpen}>Sessions</button>
      {/if}
      <small>● Local · Read-only project inspection</small>
    </div>
  </header>
  <SessionsPanel bind:open={sessionsOpen} currentId={sessionId}
    onResume={resume} onNew={startNew} onDelete={remove} onRename={rename} />
  <main class:sandbox-workspace={studioMode === 'sandbox'}>
    <aside class="studio-sidebar" aria-label="Component library">
      <div class="sidebar-heading">
        <h1>{studioMode === 'sandbox' ? 'Components' : 'Discovered packages'}</h1>
        <p>{studioMode === 'sandbox' ? 'Choose a component to add it to your canvas.' : 'Inspect package dependencies found in your project.'}</p>
      </div>
      {#if studioMode === 'sandbox'}
        <label for="catalog-filter">Find a component</label>
        <input id="catalog-filter" type="search" bind:value={catalogFilter} placeholder="Search components…" />
        <nav class="catalog" aria-label="Add architecture components">
          {#each CATALOG_GROUPS as group (group)}
            {#if filteredCatalog.some((item) => item.group === group)}
              <h2 class="catalog-group">{group}</h2>
              {#each filteredCatalog.filter((item) => item.group === group) as item (item.id)}
                <button class="catalog-item" type="button" onclick={() => requestAdd(item.id)}
                  aria-label={`Add ${item.name}`} title={item.description}>
                  <span class="catalog-symbol" aria-hidden="true">{item.symbol}</span>
                  <span class="catalog-description">
                    <strong>{item.name}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span class="catalog-plus" aria-hidden="true">+</span>
                </button>
              {/each}
            {/if}
          {/each}
          {#if filteredCatalog.length === 0}
            <p role="status">No components match your search.</p>
          {/if}
        </nav>
        <p class="sidebar-hint">Components are hypothetical. Their capacity and traffic are modeled, not observed.</p>
      {:else}
        <label for="component-filter">Filter packages</label>
        <input id="component-filter" type="search" bind:value={filter} placeholder="Name or framework" />
        {#if graph}
          <p>{visible.length} of {graph.nodes.length} packages</p>
        {/if}
        <nav aria-label="Discovered packages">
          {#each visible as node (node.id)}
            <button type="button" class="node-item" class:active={selectedId === node.id}
              onclick={() => (selectedId = node.id)}>{node.label}</button>
          {/each}
        </nav>
        <p class="sidebar-hint">Discovered dependencies are evidence-based, not measured runtime calls.</p>
      {/if}
    </aside>
    <section class="workspace" aria-label="Architecture workspace">
      <div class="workspace-header">
        <div>
          <h1>{studioMode === 'sandbox' ? 'Your architecture playground' : 'Discovered architecture'}</h1>
          <p>{studioMode === 'sandbox'
            ? 'Build a hypothetical system, connect components, then explore modeled outcomes.'
            : 'Inspect declared package dependencies from your local project.'}</p>
        </div>
        <button type="button" onclick={() => void loadGraph()}>Refresh graph</button>
      </div>
      {#if loading}
        <div class="alert" role="status">Discovering architecture…</div>
      {:else if loadError}
        <div class="alert" role="alert">{loadError} <button type="button" onclick={() => void loadGraph()}>Retry</button></div>
      {:else if graph}
        {#if graph.nodes.length === 0}
          <div role="status" class="persistence-status">
            No package manifests found. You can still experiment with hypothetical architecture in Sandbox.
          </div>
        {/if}
        {#if historical}
          <div class="historical-notice" role="status">
            Architecture changed since this session started. You are viewing the graph as it was then.
            <button type="button" onclick={() => void startNewFromNotice()}>Start a new session on the current graph</button>
            {#if noticeError}<span role="alert">{noticeError}</span>{/if}
          </div>
        {/if}
        {#key workspaceKey}
          <ArchitectureCanvas {graph} {visibleIds} bind:selectedId bind:mode={studioMode} {addRequest}
            {initialDocument} onDocumentChange={(text) => autosave?.schedule(text)}
            onRestoreFailed={restoreFailed} />
        {/key}
      {/if}
      {#if graph && graph.diagnostics.length > 0}
        <details><summary>{graph.diagnostics.length} scan diagnostics</summary>
          <ul>{#each graph.diagnostics as diagnostic, i (i)}<li>{diagnostic}</li>{/each}</ul>
        </details>
      {/if}
    </section>
    <aside aria-label="Component inspector" class="discovered-inspector">
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
        <p>{studioMode === 'sandbox'
          ? 'Select a component on the canvas to inspect its modeled behavior. Select a connection to change its intent.'
          : 'Select a discovered package to inspect its manifest evidence.'}</p>
      {/if}
      {#if currentQuestion}
        <section aria-label="Architecture Coach">
          <h2>Architecture Coach · Offline</h2>
          <p>{currentQuestion.question}</p>
          <p>{currentQuestion.explanation}</p>
          <button type="button" onclick={() => (questionIndex += 1)}>Next question</button>
        </section>
      {/if}
    </aside>
  </main>
</div>
