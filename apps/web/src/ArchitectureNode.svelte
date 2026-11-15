<script lang="ts">
  import { Handle, Position } from '@xyflow/svelte';
  import { findCatalogComponent } from './component-catalog.js';

  let { data, selected = false }: {
    data: Record<string, unknown>;
    selected?: boolean;
  } = $props();

  const name = $derived(String(data.name ?? data.label ?? 'Component'));
  const kind = $derived(String(data.kind ?? 'service'));
  const preset = $derived(findCatalogComponent(String(data.preset ?? '')));
  const status = $derived(String(data.status ?? 'normal'));
  const symbol = $derived(preset?.symbol ?? (kind === 'cache' ? '◇' : kind === 'database' ? '▤' : kind === 'queue' ? '☷' : '▣'));
  const active = $derived(status === 'bottleneck' || status === 'failed');
  const percent = $derived(typeof data.utilization === 'number' ? Math.round(data.utilization * 100) : null);
  const dropped = $derived(typeof data.droppedRps === 'number' ? data.droppedRps : 0);
</script>

<div class:chosen={selected} class:critical={active} class:warning={status === 'near-capacity'} class="archwise-node">
  <Handle type="target" position={Position.Left} class="archwise-handle archwise-handle-in" />
  <div class="archwise-node-head">
    <span class="archwise-node-icon" aria-hidden="true">{symbol}</span>
    <div class="archwise-node-title">
      <strong>{name}</strong>
      <small>{preset?.group ?? kind} · hypothetical</small>
    </div>
  </div>
  <div class="archwise-node-foot">
    {#if status === 'failed'}
      <span class="archwise-node-state">Failed (modeled)</span>
    {:else if status === 'bottleneck'}
      <span class="archwise-node-state">Bottleneck · {dropped.toFixed(1)} dropped RPS</span>
    {:else if percent !== null}
      <span class="archwise-node-state">Modeled use: {percent}%</span>
    {:else}
      <span class="archwise-node-state">Ready to configure</span>
    {/if}
    <span class="archwise-node-kind">{kind}</span>
  </div>
  <Handle type="source" position={Position.Right} class="archwise-handle archwise-handle-out" />
</div>
