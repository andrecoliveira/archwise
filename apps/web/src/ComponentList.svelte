<script lang="ts">
  import { confidenceLevel, lineStyle, nodeReasonLine, primaryName, secondLine } from './claims.js';
  import type { Filter } from './counters.js';
  import type { GraphNode } from './graph-types.js';

  let {
    nodes,
    selectedId,
    onSelect,
    filter = null,
    hidden = [],
    onShowAll = () => {},
  }: {
    nodes: readonly GraphNode[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    filter?: Filter | null;
    /** Libraries the System view hides (spec §5.8). */
    hidden?: readonly GraphNode[];
    onShowAll?: () => void;
  } = $props();

  let librariesOpen = $state(false);
  // The inferred-components filter dims what it does not count; the reasons stay visible.
  const dimmed = (node: GraphNode): boolean =>
    filter === 'inferred-components' && confidenceLevel(node) === 'observed';
</script>

<nav aria-label="Discovered components">
  {#each nodes as node (node.id)}
    {@const reason = nodeReasonLine(node)}
    <button type="button" class="node-item" class:active={selectedId === node.id} class:dimmed={dimmed(node)}
      aria-pressed={selectedId === node.id} onclick={() => onSelect(node.id)}>
      <span class={`level-marker ${lineStyle(confidenceLevel(node))}`} aria-hidden="true"></span>
      <span class="node-item-text">
        <strong title={primaryName(node)}>{primaryName(node)}</strong>
        {#if secondLine(node)}<small>{secondLine(node)}</small>{/if}
        {#if reason}<small class="node-item-reason">{reason}</small>{/if}
      </span>
    </button>
  {/each}
</nav>
{#if hidden.length > 0}
  <div class="hidden-libraries">
    <button type="button" class="hidden-libraries-toggle" aria-expanded={librariesOpen}
      aria-controls="hidden-libraries-list" onclick={() => (librariesOpen = !librariesOpen)}>Libraries · {hidden.length} hidden</button>
    {#if librariesOpen}
      <div id="hidden-libraries-list">
        <ul>
          {#each hidden as library (library.id)}<li title={library.label}>{library.label}</li>{/each}
        </ul>
        <button type="button" onclick={onShowAll}>Show all packages</button>
      </div>
    {/if}
  </div>
{/if}
