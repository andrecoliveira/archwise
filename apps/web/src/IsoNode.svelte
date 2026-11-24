<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import Piece from './iso/Piece.svelte';
  import Plinth from './iso/Plinth.svelte';
  import { pieceForNode, pieceForPreset } from './iso/piece-map.js';
  import { findCatalogComponent } from './component-catalog.js';
  import { kindLabel, type GraphNode } from './graph-types.js';
  import { nodeReasonLine, secondLine } from './claims.js';

  /** A hypothetical Sandbox component, with its modeled state. */
  interface Proposed {
    readonly label: string;
    readonly preset: string;
    readonly status?: string;
    readonly utilization?: number;
    readonly droppedRps?: number;
  }

  let {
    data,
    selected = false,
  }: {
    data: { node?: GraphNode; proposed?: Proposed; animated?: boolean; dimmed?: boolean };
    selected?: boolean;
  } = $props();

  const node = $derived(data.node);
  const proposed = $derived(data.proposed);
  const inferred = $derived(node?.confidence === 'inferred');
  const choice = $derived(
    proposed
      ? pieceForPreset(proposed.preset)
      : { piece: pieceForNode({ type: node?.type ?? 'unknown', ...(node && 'category' in node ? { category: String(node.category) } : {}) }) },
  );
  const label = $derived(proposed?.label ?? node?.label ?? '');
  const detail = $derived.by(() => {
    if (proposed) return `${findCatalogComponent(proposed.preset)?.name ?? proposed.preset} · hypothetical`;
    if (!node) return '';
    return [kindLabel(node.type), secondLine(node)].filter((part) => part).join(' · ');
  });
  const reason = $derived(node ? nodeReasonLine(node) : null);
  const status = $derived.by(() => {
    if (!proposed) return null;
    if (proposed.status === 'failed') return 'Failed (modeled)';
    if (proposed.status === 'bottleneck') return `Bottleneck · ${(proposed.droppedRps ?? 0).toFixed(1)} dropped RPS`;
    if (typeof proposed.utilization === 'number') return `Modeled use: ${Math.round(proposed.utilization * 100)}%`;
    return 'Ready to configure';
  });
</script>

<!-- A component as an isometric piece on its plinth; the pill below names it. -->
<div class="iso-node" class:dimmed={data.dimmed} class:proposed={!!proposed}
  data-kind={node?.type ?? 'proposed'} data-confidence={node?.confidence ?? 'proposed'}>
  {#if proposed}
    <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in"
      aria-label="Input port — click to complete a connection" title="Input: click after choosing an output" />
  {:else}
    <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in" isConnectable={false} />
  {/if}
  <svg class="iso-svg" viewBox="-116 -136 232 206" width="200" height="178" aria-hidden="true">
    <Plinth {selected} proposed={!!proposed} />
    <Piece piece={choice.piece} {...choice.glyph ? { glyph: choice.glyph } : {}} {inferred} animated={data.animated ?? false} />
  </svg>
  <div class="iso-pill">
    <strong title={label}>{label}</strong>
    <small title={detail}>{detail}</small>
    {#if reason}<small class="iso-reason" title={reason}>{reason}</small>{/if}
    {#if status}<small class="iso-status">{status}</small>{/if}
    {#if proposed}<span class="proposed-tag">Proposed</span>{/if}
  </div>
  {#if proposed}
    <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out"
      aria-label="Output port — click to start a connection" title="Output: click then click an input" />
  {:else}
    <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out" isConnectable={false} />
  {/if}
</div>
