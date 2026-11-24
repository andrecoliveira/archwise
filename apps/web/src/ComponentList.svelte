<script lang="ts">
  import { confidenceLevel, lineStyle, nodeReasonLine, primaryName, secondLine } from './claims.js';
  import type { GraphNode } from './graph-types.js';

  let {
    nodes,
    selectedId,
    onSelect,
  }: {
    nodes: readonly GraphNode[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  } = $props();
</script>

<nav aria-label="Discovered components">
  {#each nodes as node (node.id)}
    {@const reason = nodeReasonLine(node)}
    <button type="button" class="node-item" class:active={selectedId === node.id}
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
