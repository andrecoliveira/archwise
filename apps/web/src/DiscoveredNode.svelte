<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { kindLabel, type GraphNode } from './graph-types.js';

  let { data, selected = false }: { data: { node: GraphNode }; selected?: boolean } = $props();

  const SYMBOLS: Record<GraphNode['type'], string> = {
    frontend: '◧',
    service: '▣',
    module: '▢',
    datastore: '▤',
    queue: '☷',
    'external-system': '◎',
    job: '⏱',
  };
  const node = $derived(data.node);
  const subtitle = $derived(
    [kindLabel(node.type), node.technology, node.confidence === 'inferred' ? 'inferred' : null]
      .filter((part) => part !== null)
      .join(' · '),
  );
</script>

<div class="archwise-node discovered-node" class:chosen={selected} class:inferred={node.confidence === 'inferred'}
  data-kind={node.type}>
  <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in" isConnectable={false} />
  <div class="archwise-node-head">
    <span class="archwise-node-icon" aria-hidden="true">{SYMBOLS[node.type]}</span>
    <div class="archwise-node-title">
      <strong>{node.label}</strong>
      <small>{subtitle}</small>
      {#if node.repository}<small>{node.repository.label}</small>{/if}
    </div>
  </div>
  <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out" isConnectable={false} />
</div>
