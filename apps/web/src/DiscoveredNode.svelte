<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { kindLabel, type GraphNode } from './graph-types.js';

  let { data, selected = false }: { data: { node: GraphNode; dimmed?: boolean }; selected?: boolean } = $props();

  const node = $derived(data.node);
  /** Second line: what it runs on, and which repository it belongs to in multi-root workspaces. */
  const detail = $derived([node.technology, node.repository?.label].filter((part) => part).join(' · '));
</script>

<!-- The fill says what the component is; a dashed outline plus the word "inferred" says Archwise
     deduced it. Only selection uses the accent colour. -->
<div class="archwise-node discovered-node" class:chosen={selected} class:dimmed={data.dimmed} class:inferred={node.confidence === 'inferred'}
  data-kind={node.type} data-confidence={node.confidence}>
  <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in" isConnectable={false} />
  <div class="discovered-kind">{kindLabel(node.type)}</div>
  <strong class="discovered-label" title={node.label}>{node.label}</strong>
  {#if detail || node.confidence === 'inferred'}
    <small class="discovered-detail">
      {detail}{#if detail && node.confidence === 'inferred'}{' · '}{/if}{#if node.confidence === 'inferred'}<span class="discovered-inferred">inferred</span>{/if}
    </small>
  {/if}
  <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out" isConnectable={false} />
</div>
