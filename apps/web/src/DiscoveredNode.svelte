<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { kindLabel, type GraphNode } from './graph-types.js';
  import { confidenceLevel, lineStyle, nodeReasonLine, secondLine } from './claims.js';

  let { data, selected = false }: { data: { node: GraphNode; dimmed?: boolean }; selected?: boolean } = $props();

  const node = $derived(data.node);
  /** Second line: technology, folder and, in multi-root workspaces, the repository. */
  const detail = $derived(secondLine(node));
  const reason = $derived(nodeReasonLine(node));
  const style = $derived(lineStyle(confidenceLevel(node)));
</script>

<!-- The fill says what the component is; the outline style says how sure Archwise is (solid,
     dashed, dotted), and the first reason says why. Only selection uses the accent colour. -->
<div class={`archwise-node discovered-node ${style}`} class:chosen={selected} class:dimmed={data.dimmed} class:inferred={node.confidence === 'inferred'}
  data-kind={node.type} data-confidence={node.confidence}>
  <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in" isConnectable={false} />
  <div class="discovered-kind">{kindLabel(node.type)}</div>
  <strong class="discovered-label" title={node.label}>{node.label}</strong>
  {#if detail}<small class="discovered-detail" title={detail}>{detail}</small>{/if}
  {#if reason}<small class="discovered-reason" title={reason}>{reason}</small>{/if}
  <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out" isConnectable={false} />
</div>
