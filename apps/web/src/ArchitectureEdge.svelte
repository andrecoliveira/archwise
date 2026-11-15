<script lang="ts">
  import { BaseEdge, EdgeLabel, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
  import { CONNECTION_STYLES, isConnectionIntent } from './connection-intents.js';

  let {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected = false,
    data,
    markerEnd,
    interactionWidth,
  }: EdgeProps = $props();

  const intent = $derived(isConnectionIntent(data?.intent) ? data.intent : 'REQ');
  const theme = $derived(CONNECTION_STYLES[intent]);
  function selectLabel(event: MouseEvent): void {
    event.stopPropagation();
    if (typeof data?.onSelect === 'function') data.onSelect(id);
  }
  const [path, labelX, labelY] = $derived(getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    borderRadius: 12, offset: 25,
  }));
</script>

<BaseEdge {id} {path} markerEnd={markerEnd ?? ''} interactionWidth={interactionWidth ?? 28}
  class={selected ? 'archwise-edge-path archwise-edge-selected' : 'archwise-edge-path'}
  style={`stroke:${theme.color};stroke-width:${selected ? 3 : 2};fill:none;`} />
<EdgeLabel x={labelX} y={labelY} class="archwise-edge-label">
  <button type="button" class:selected class="archwise-edge-pill"
    aria-label={`Edit ${theme.label} connection`} style:--intent-color={theme.color}
    onclick={selectLabel}>
    {theme.label}
  </button>
</EdgeLabel>
