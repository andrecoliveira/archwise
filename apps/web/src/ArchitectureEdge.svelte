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
  const [path, labelX, labelY] = $derived(getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    borderRadius: 12, offset: 25,
  }));
</script>

<BaseEdge {id} {path} {markerEnd} {interactionWidth}
  class={selected ? 'archwise-edge-path archwise-edge-selected' : 'archwise-edge-path'}
  style={`stroke:${theme.color};stroke-width:${selected ? 3 : 2};fill:none;`} />
<EdgeLabel x={labelX} y={labelY} class="archwise-edge-label" selectEdgeOnClick>
  <span class:selected class="archwise-edge-pill" style:--intent-color={theme.color}>
    {theme.label}
  </span>
</EdgeLabel>
