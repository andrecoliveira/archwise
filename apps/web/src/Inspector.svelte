<script lang="ts">
  import ReasonList from './ReasonList.svelte';
  import {
    confidenceLevel,
    kindToken,
    levelWord,
    primaryName,
    relationWording,
    secondLine,
    summaryLine,
  } from './claims.js';
  import { kindLabel, type Graph, type GraphEdge, type GraphEvidence, type GraphNode } from './graph-types.js';
  import { evidenceFile, evidenceKey } from './reason-catalog.js';
  import { excerptMessage, excerptOwnerKey, fetchExcerpt, type ExcerptResult } from './excerpt-client.js';

  export type InspectorTab = 'details' | 'relations' | 'evidence';

  let {
    node,
    view,
    full,
    excerptIds,
    historical = false,
    tab = $bindable('details'),
    onSelect,
    fetcher = fetch,
  }: {
    node: GraphNode | null;
    view: Graph;
    full: Graph;
    excerptIds: ReadonlyMap<string, string>;
    historical?: boolean;
    tab?: InspectorTab;
    onSelect: (id: string) => void;
    fetcher?: typeof fetch;
  } = $props();

  const TABS: { id: InspectorTab; label: string }[] = [
    { id: 'details', label: 'Details' },
    { id: 'relations', label: 'Relations' },
    { id: 'evidence', label: 'Evidence' },
  ];
  const tabButtons: Record<string, HTMLButtonElement | null> = $state({});

  function onTabKey(event: KeyboardEvent, index: number): void {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    tab = next.id;
    tabButtons[next.id]?.focus();
  }

  const nodeById = $derived(new Map([...full.nodes, ...view.nodes].map((item) => [item.id, item])));
  const level = $derived(node ? confidenceLevel(node) : 'observed');
  const uses = $derived(node ? view.edges.filter((edge) => edge.source === node.id) : []);
  const usedBy = $derived(node ? view.edges.filter((edge) => edge.target === node.id) : []);

  const at = (item: GraphEvidence): string =>
    item.lines === null ? item.path : `${item.path}:${item.lines.start}`;
  const aliasSource = $derived(
    node?.evidence.find((item) => item.kind === 'compose-build' || item.kind === 'compose-service') ?? null,
  );
  const evidenceGroups = $derived.by(() => {
    const groups = new Map<string, GraphEvidence[]>();
    for (const item of node?.evidence ?? []) groups.set(item.path, [...(groups.get(item.path) ?? []), item]);
    return [...groups].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  });
  const rangeText = (item: GraphEvidence): string =>
    item.lines === null
      ? 'whole file'
      : item.lines.start === item.lines.end
        ? `line ${item.lines.start}`
        : `lines ${item.lines.start}–${item.lines.end}`;

  // Excerpts and copy notices belong to the selected component; a new selection starts empty.
  let notes = $state<{ owner: string | null; excerpts: Record<string, ExcerptResult | 'loading'>; copied: Record<string, string> }>({
    owner: null,
    excerpts: {},
    copied: {},
  });
  const own = (): void => {
    if (notes.owner !== (node?.id ?? null)) notes = { owner: node?.id ?? null, excerpts: {}, copied: {} };
  };
  const excerptOf = (key: string): ExcerptResult | 'loading' | undefined =>
    notes.owner === (node?.id ?? null) ? notes.excerpts[key] : undefined;
  const copiedOf = (key: string): string | undefined =>
    notes.owner === (node?.id ?? null) ? notes.copied[key] : undefined;
  const excerptIdOf = (item: GraphEvidence): string | undefined =>
    item.excerptId ?? (node ? excerptIds.get(excerptOwnerKey(node.id, item)) : undefined);

  async function showLines(item: GraphEvidence, id: string): Promise<void> {
    own();
    const key = evidenceKey(item);
    notes.excerpts[key] = 'loading';
    const owner = notes.owner;
    const result = await fetchExcerpt(id, fetcher);
    if (notes.owner === owner) notes.excerpts[key] = result;
  }

  async function copy(item: GraphEvidence): Promise<void> {
    own();
    const key = evidenceKey(item);
    try {
      await navigator.clipboard.writeText(at(item));
      notes.copied[key] = 'Copied';
    } catch {
      notes.copied[key] = 'Copy failed — select the text instead';
    }
  }

  const other = (edge: GraphEdge, outgoing: boolean): GraphNode | undefined =>
    nodeById.get(outgoing ? edge.target : edge.source);
</script>

<section class="inspector" aria-label="Discovered component">
  {#if node}
    <header class="inspector-header">
      <h2>{primaryName(node)}</h2>
      <p class="inspector-kind"><span class="kind-swatch" style={`background: ${kindToken(node.type)}`} aria-hidden="true"></span>{kindLabel(node.type)}</p>
      {#if secondLine(node)}<p class="inspector-second">{secondLine(node)}</p>{/if}
      <p class="inspector-summary">{summaryLine(node, view)}</p>
    </header>

    <section class={`confidence-band ${level}`} aria-label="Confidence">
      <p class="band-level"><strong>{levelWord(level)} because:</strong>{node.reasons.length === 0 ? ' no reason recorded' : ''}</p>
      <ReasonList reasons={node.reasons} context={{ subject: node, evidence: node.evidence }} />
      {#if level !== 'observed'}
        <p class="band-caution">No file states this directly. Check before relying on it.</p>
      {/if}
    </section>

    <div class="inspector-tabs" role="tablist" aria-label="Component details">
      {#each TABS as item, index (item.id)}
        <button type="button" role="tab" id={`inspector-tab-${item.id}`} aria-controls="inspector-panel"
          aria-selected={tab === item.id} tabindex={tab === item.id ? 0 : -1}
          bind:this={tabButtons[item.id]}
          onclick={() => (tab = item.id)} onkeydown={(event) => onTabKey(event, index)}>{item.label}</button>
      {/each}
    </div>

    <div class="inspector-panel" id="inspector-panel" role="tabpanel" aria-labelledby={`inspector-tab-${tab}`}>
      {#if tab === 'details'}
        {#if (node.properties?.length ?? 0) > 0}
          <dl class="properties">
            {#each node.properties ?? [] as property, i (i)}
              <dt>{property.name}</dt>
              <dd>
                <span class="property-value">{property.value}</span>
                <details class="property-source">
                  <summary title={`${evidenceFile(property.evidence)} · ${property.evidence.kind}`}>{at(property.evidence)}</summary>
                  <span>{evidenceFile(property.evidence)} · {property.evidence.kind}</span>
                </details>
              </dd>
            {/each}
          </dl>
        {/if}
        {#each node.aliases as alias (alias)}
          <p class="alias">{aliasSource ? `Also called ${alias} · ${at(aliasSource)}` : `Also called ${alias}`}</p>
        {/each}
        {#if node.repository}<p>Repository: {node.repository.label}</p>{/if}
        {#if node.outsideWorkspace}<p>Outside the declared workspace</p>{/if}
        {#if (node.properties?.length ?? 0) === 0 && node.aliases.length === 0}
          <p class="quiet">No configuration values recorded for this component.</p>
        {/if}
      {:else if tab === 'relations'}
        {#each [{ title: 'Uses', list: uses, outgoing: true }, { title: 'Used by', list: usedBy, outgoing: false }] as group (group.title)}
          <h3>{group.title}</h3>
          {#if group.list.length === 0}
            <p class="quiet">None found.</p>
          {:else}
            <ul class="relations">
              {#each group.list as edge (edge.id)}
                {@const target = other(edge, group.outgoing)}
                {@const edgeLevel = confidenceLevel(edge)}
                <li class={`relation-row ${edgeLevel}`}>
                  {#if target}
                    <button type="button" class="relation-target" onclick={() => onSelect(target.id)}>
                      <span class="kind-swatch" style={`background: ${kindToken(target.type)}`} aria-hidden="true"></span>
                      <span class="relation-name">{primaryName(target)}</span>
                      <span class="relation-kind">{kindLabel(target.type)}</span>
                    </button>
                  {/if}
                  <p class="relation-wording">{edge.indirect ? `${relationWording(edge.type)} · through ${edge.indirect.through.join(', ')}` : relationWording(edge.type)}</p>
                  <p class="band-level"><strong>{levelWord(edgeLevel)} because:</strong>{!edge.indirect && edge.reasons.length === 0 ? ' no reason recorded' : ''}</p>
                  {#if edge.indirect}
                    <ol class="chain">
                      {#each edge.indirect.steps as step (step.id)}
                        {@const from = nodeById.get(step.source)}
                        {@const to = nodeById.get(step.target)}
                        <li>
                          <p>{from?.label ?? step.source} {relationWording(step.type)} {to?.label ?? step.target} · {levelWord(confidenceLevel(step))}</p>
                          {#if from}<ReasonList reasons={step.reasons} context={{ subject: from, ...(to ? { target: to } : {}), evidence: step.evidence }} />{/if}
                        </li>
                      {/each}
                    </ol>
                    {#if edge.indirect.others.length > 0}
                      <p class="also-through">Also through {edge.indirect.others.map((list) => list.join(', ')).join('; ')}</p>
                    {/if}
                  {:else}
                    {@const from = nodeById.get(edge.source)}
                    {@const to = nodeById.get(edge.target)}
                    {#if from}<ReasonList reasons={edge.reasons} context={{ subject: from, ...(to ? { target: to } : {}), evidence: edge.evidence }} />{/if}
                  {/if}
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      {:else}
        {#each evidenceGroups as [path, items] (path)}
          <h3>{path}</h3>
          <ul class="evidence-items">
            {#each items as item, i (i)}
              {@const key = evidenceKey(item)}
              {@const id = excerptIdOf(item)}
              {@const excerpt = excerptOf(key)}
              <li>
                <p><span class="evidence-rule">{item.kind}</span> · {rangeText(item)}</p>
                <div class="evidence-actions">
                  <button type="button" aria-label={`Copy ${at(item)}`} onclick={() => void copy(item)}>Copy <code>{at(item)}</code></button>
                  {#if id}
                    <button type="button" aria-label={`Show lines of ${at(item)}`} onclick={() => void showLines(item, id)}>Show lines</button>
                  {:else}
                    <span class="quiet">{historical ? 'Not available: this evidence is from an earlier scan.' : 'Lines are not available for this item.'}</span>
                  {/if}
                </div>
                {#if copiedOf(key)}<p class="quiet" role="status">{copiedOf(key)}{#if copiedOf(key) !== 'Copied'}: <code>{at(item)}</code>{/if}</p>{/if}
                {#if excerpt === 'loading'}
                  <p class="quiet" role="status">Loading lines…</p>
                {:else if excerpt && excerpt.status === 'ok'}
                  <pre class="excerpt" aria-label={`Lines ${excerpt.start}–${excerpt.end} of ${excerpt.path}`}>{excerpt.lines.join('\n')}</pre>
                {:else if excerpt}
                  <p class="quiet" role="status">{excerptMessage(excerpt)}</p>
                {/if}
              </li>
            {/each}
          </ul>
        {/each}
      {/if}
    </div>
  {:else}
    <p class="inspector-empty">Select a component on the canvas or in the list to see what it is, what it relates to, and why.</p>
  {/if}
</section>
