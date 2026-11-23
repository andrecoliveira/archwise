<script lang="ts">
  import { onMount, tick } from 'svelte';
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
  import { kindLabel, upgradeGraph, type Graph } from './graph-types.js';
  import { graphForView, initialView, showsNothingRecognized, type StudioView } from './system-view.js';
  import { isScanSummary, nodeDisplayLabel, type ScanSummaryView } from './scan-summary.js';
  import { scanNotes } from './scan-notes.js';
  import { placeholderChip, revisionChip, workspaceName } from './scan-status.js';
  import { initialMode, isSearchShortcut, type StudioMode } from './studio-mode.js';
  import { applyTheme, nextTheme, readTheme, safeStorage, writeTheme, type Theme } from './theme.js';
  import { nodeStyleFor, readNodeStyle, writeNodeStyle, type NodeStyle, type StyleView } from './node-style.js';
  import ScanNotes from './ScanNotes.svelte';
  import StudioTopBar from './StudioTopBar.svelte';
  import './studio.css';

  let graphData = $state<Graph | null>(null);
  let scan = $state<ScanSummaryView | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let selectedId: string | null = $state(null);
  let filter = $state('');
  let catalogFilter = $state('');
  let studioMode: StudioMode = $state('sandbox');
  let modeChosen = false;

  // Theme: dark by default, remembered per browser.
  let theme: Theme = $state(readTheme(safeStorage()));
  function toggleTheme(): void {
    theme = nextTheme(theme);
    writeTheme(safeStorage(), theme);
    applyTheme(document.documentElement, theme);
  }

  // Side columns: open by default on wide screens, drawers (closed) below 1100 px.
  const WIDE = '(min-width: 1100px)';
  const startsWide = typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches !== false;
  let wide = $state(startsWide);
  let leftShown = $state(startsWide);
  let rightShown = $state(startsWide);
  let searchInput: HTMLInputElement | null = $state(null);
  let leftToggle: HTMLButtonElement | null = $state(null);
  let rightToggle: HTMLButtonElement | null = $state(null);
  let leftClose: HTMLButtonElement | null = $state(null);
  let rightClose: HTMLButtonElement | null = $state(null);
  const drawerOpen = $derived.by(() => !wide && (leftShown || (rightShown && studioMode === 'explore')));

  /** On wide screens a toggle collapses its column; on narrow ones it opens a modal drawer. */
  async function toggleColumn(side: 'left' | 'right'): Promise<void> {
    const opening = side === 'left' ? !leftShown : !rightShown;
    if (side === 'left') leftShown = opening;
    else rightShown = opening;
    if (wide || !opening) return;
    await tick();
    (side === 'left' ? leftClose : rightClose)?.focus();
  }

  /** Closes any open drawer and returns focus to the toggle that opened it. */
  async function closeDrawers(): Promise<void> {
    const opener = leftShown ? leftToggle : rightToggle;
    leftShown = false;
    rightShown = false;
    await tick();
    opener?.focus();
  }
  let now = $state(Date.now());
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
  let graphView: StudioView = $state('system');
  /** True when the System view would be empty, so the Studio opened on All packages. */
  const nothingRecognized = $derived(graph !== null && showsNothingRecognized(graph, historical));
  const shownGraph = $derived(graph ? graphForView(graph, graphView) : null);
  const visible = $derived(
    shownGraph?.nodes.filter((node) =>
      `${node.label} ${node.technology ?? ''} ${node.id}`.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [],
  );
  const visibleIds = $derived(new Set(visible.map((node) => node.id)));
  const selected = $derived(graph?.nodes.find((node) => node.id === selectedId) ?? null);
  const chip = $derived(
    graph ? revisionChip({ scan, graph, storeEnabled, historical, now }) : null,
  );
  const notes = $derived(graph ? scanNotes(graph) : null);
  // Pieces or cards: derived per view (System, All packages, Sandbox); a person's choice is remembered.
  const styleView: StyleView = $derived.by(() =>
    studioMode === 'sandbox' ? 'sandbox' : graphView === 'all' ? 'all' : 'system',
  );
  let styleRevision = $state(0);
  const nodeStyle: NodeStyle = $derived.by(() => {
    void styleRevision;
    return nodeStyleFor(styleView, shownGraph?.nodes.length ?? 0, readNodeStyle(safeStorage(), styleView));
  });
  function chooseNodeStyle(style: NodeStyle): void {
    writeNodeStyle(safeStorage(), styleView, style);
    styleRevision += 1;
  }
  const lineOf = (item: { path: string; lines: { start: number } | null }): string =>
    item.lines === null ? item.path : `${item.path}:${item.lines.start}`;
  const coachQuestions = $derived(graph ? getCoachQuestions(graph, selectedId) : []);
  let questionIndex = $state(0);
  const currentQuestion = $derived(coachQuestions[questionIndex % Math.max(coachQuestions.length, 1)]);

  const UNSAVED_SWITCH =
    'Your latest changes are not saved yet. Retry saving, or export them as JSON, before switching.';
  let noticeError = $state('');

  /** The scan summary is optional: an older server or a failed request just hides it. */
  async function loadScan(signal: AbortSignal): Promise<void> {
    try {
      const response = await fetch('/api/v1/scan', { credentials: 'same-origin', signal });
      // Always read the body, so a 404 from an older server does not leave the request open.
      const body: unknown = await response.json().catch(() => null);
      const payload = response.ok ? body : null;
      if (!signal.aborted) scan = isScanSummary(payload) ? payload : null;
    } catch {
      if (!signal.aborted) scan = null;
    }
  }

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
      const payload = upgradeGraph(await response.json());
      if (payload === null) throw new Error('Unsupported graph format.');
      void loadScan(signal);
      const current = await getCurrent();
      let detail: { baseIsCurrent: boolean; view: unknown; sandbox: string } | null = null;
      if (current.ok && current.value.storeEnabled && current.value.persisted && current.value.id) {
        const loaded = await getSession(current.value.id);
        if (loaded.ok) detail = loaded.value;
      }
      if (!signal.aborted) {
        const chosen = chooseWorkspaceGraph(detail, payload);
        graphData = chosen.graph;
        graphView = initialView(chosen.graph);
        // Only the first load picks the mode; later reloads keep the one the person chose.
        if (!modeChosen) studioMode = initialMode(chosen.graph);
        modeChosen = true;
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
    const clock = window.setInterval(() => (now = Date.now()), 60_000);
    const media = window.matchMedia?.(WIDE);
    const onMedia = (event: MediaQueryListEvent) => {
      wide = event.matches;
      leftShown = event.matches;
      rightShown = event.matches;
    };
    media?.addEventListener('change', onMedia);
    const onKey = (event: KeyboardEvent) => {
      if (isSearchShortcut(event) && studioMode === 'explore' && searchInput) {
        event.preventDefault();
        searchInput.focus();
      } else if (event.key === 'Escape' && drawerOpen) {
        void closeDrawers();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      controller?.abort();
      autosave?.dispose();
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(clock);
      media?.removeEventListener('change', onMedia);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<svelte:head><title>Archwise — Architecture Studio</title></svelte:head>
<div class="studio">
  <div class="topbar-wrap" inert={drawerOpen}>
  <StudioTopBar workspace={workspaceName(scan)} chip={chip ?? placeholderChip(loading)}
    {scan} bind:mode={studioMode} bind:search={filter} bind:searchInput {theme} onToggleTheme={toggleTheme}
    {saveStatus} onRetrySave={() => autosave?.retry()} {storeEnabled} bind:sessionsOpen
    bind:nodeStyle={() => nodeStyle, chooseNodeStyle} />
  </div>
  <SessionsPanel bind:open={sessionsOpen} currentId={sessionId}
    onResume={resume} onNew={startNew} onDelete={remove} onRename={rename} />
  <main class:sandbox-workspace={studioMode === 'sandbox'} class:narrow={!wide}
    class:left-hidden={!leftShown} class:right-hidden={!rightShown || studioMode === 'sandbox'}>
    <aside class="studio-sidebar" id="components-column" aria-label="Component library" class:drawer-open={!wide && leftShown}>
      {#if !wide}<button type="button" class="drawer-close" bind:this={leftClose} onclick={() => void closeDrawers()}>Close components</button>{/if}
      <div class="sidebar-heading">
        <h1>{studioMode === 'sandbox' ? 'Components' : 'Discovered components'}</h1>
        <p>{studioMode === 'sandbox' ? 'Choose a component to add it to your canvas.' : 'Frontends, services and infrastructure found in your project.'}</p>
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
        {#if shownGraph}
          <p class="list-count">{visible.length} of {shownGraph.nodes.length} components</p>
        {/if}
        <nav aria-label="Discovered components">
          {#each visible as node (node.id)}
            <button type="button" class="node-item" class:active={selectedId === node.id}
              title={nodeDisplayLabel(node)} onclick={() => (selectedId = node.id)}>{nodeDisplayLabel(node)}</button>
          {/each}
        </nav>
        {#if notes}<ScanNotes view={notes} />{/if}
      {/if}
    </aside>
    <section class="workspace" aria-label="Architecture workspace" inert={drawerOpen}>
      <div class="workspace-header">
        <div class="workspace-title">
          <h1>{studioMode === 'sandbox' ? 'Your architecture playground' : 'Discovered architecture'}</h1>
          <p>{studioMode === 'sandbox'
            ? 'Build a hypothetical system, connect components, then explore modeled outcomes.'
            : 'Evidence from manifests, workspaces, Docker Compose and Prisma. Dashed items are inferred.'}</p>
        </div>
        <div class="workspace-actions">
          <button type="button" class="column-toggle" aria-controls="components-column" aria-expanded={leftShown}
            bind:this={leftToggle} onclick={() => void toggleColumn('left')}>{leftShown ? 'Hide components' : 'Show components'}</button>
          {#if graph && studioMode === 'explore'}
            <div class="graph-view-switch" role="group" aria-label="Graph view">
              <button type="button" aria-pressed={graphView === 'system'} onclick={() => (graphView = 'system')}>System</button>
              <button type="button" aria-pressed={graphView === 'all'} onclick={() => (graphView = 'all')}>All packages</button>
            </div>
          {/if}
          <button type="button" onclick={() => void loadGraph()}>Refresh graph</button>
          {#if studioMode === 'explore'}
            <button type="button" class="column-toggle" aria-controls="inspector-column" aria-expanded={rightShown}
              bind:this={rightToggle} onclick={() => void toggleColumn('right')}>{rightShown ? 'Hide inspector' : 'Show inspector'}</button>
          {/if}
        </div>
      </div>
      {#if nothingRecognized && studioMode === 'explore'}
        <p class="view-notice" role="status">No frontends, services or infrastructure were recognized; showing all packages.</p>
      {/if}
      {#if loading}
        <div class="alert" role="status">Discovering architecture…</div>
      {:else if loadError}
        <div class="alert" role="alert">{loadError} <button type="button" onclick={() => void loadGraph()}>Retry</button></div>
      {:else if graph}
        {#if graph.nodes.length === 0 && studioMode === 'explore'}
          <div role="status" class="empty-state">
            <strong>No package manifests found.</strong>
            <p>Archwise found nothing to show here. You can still design a hypothetical architecture.</p>
            <button type="button" onclick={() => (studioMode = 'sandbox')}>Open Sandbox</button>
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
          <ArchitectureCanvas {graph} view={shownGraph} {visibleIds} bind:selectedId bind:mode={studioMode} {addRequest} {nodeStyle}
            {initialDocument} onDocumentChange={(text) => autosave?.schedule(text)}
            onRestoreFailed={restoreFailed} />
        {/key}
      {/if}
    </section>
    <aside aria-label="Component inspector" class="discovered-inspector" id="inspector-column" class:drawer-open={!wide && rightShown}>
      {#if !wide}<button type="button" class="drawer-close" bind:this={rightClose} onclick={() => void closeDrawers()}>Close inspector</button>{/if}
      <h1>Inspector</h1>
      {#if selected}
        <h2>{selected.label}</h2>
        <p>Kind: {kindLabel(selected.type)}</p>
        <p>Technology: {selected.technology ?? 'Not identified'}</p>
        <p>Confidence: {selected.confidence}</p>
        <ul class="reasons">{#each selected.reasons as reason (reason)}<li>{reason}</li>{/each}</ul>
        {#if selected.aliases.length > 0}<p>Compose services: {selected.aliases.join(', ')}</p>{/if}
        {#if selected.outsideWorkspace}<p>Outside the declared workspace</p>{/if}
        {#if selected.repository}<p>Repository: {selected.repository.label}</p>{/if}
        <p>Outgoing relations: {shownGraph?.edges.filter((edge) => edge.source === selected.id).length ?? 0}</p>
        <h2>Evidence</h2>
        <ul>{#each selected.evidence as item, i (i)}
          <li><code>{lineOf(item)}</code> <small>— {item.analyzer} / {item.kind}</small></li>
        {/each}</ul>
      {:else if selectedId?.startsWith('sandbox-')}
        <h2>Hypothetical component</h2>
        <p>This component exists only in Sandbox; it does not modify repository files.</p>
      {:else}
        <p>Select a component on the canvas or in the list to see what it is, what it relates to, and why.</p>
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
    {#if drawerOpen}
      <!-- Pointer-only backdrop; keyboard users close the drawer with Esc or its Close button. -->
      <div class="drawer-scrim" aria-hidden="true" onclick={() => void closeDrawers()}></div>
    {/if}
  </main>
</div>
