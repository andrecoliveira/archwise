<script lang="ts">
  import { boxGeometry, type Box } from './kit.js';
  import { isoId } from './ids.js';

  let {
    box,
    tone,
    edge = true,
  }: { box: Box & { r: number }; tone: string; edge?: boolean } = $props();

  const id = isoId('box');
  const geometry = $derived(boxGeometry(box));
  const lit = $derived(`fill: color-mix(in srgb, ${tone} 72%, var(--lift))`);
  const shade = $derived(`stop-color: color-mix(in srgb, ${tone} 66%, var(--sink))`);
</script>

<linearGradient {id} gradientUnits="userSpaceOnUse" x1={geometry.gradient.x1} y1="0" x2={geometry.gradient.x2} y2="0">
  <stop offset="0" style:stop-color={tone} />
  <stop offset={geometry.gradient.stop} style:stop-color={tone} />
  <stop offset={geometry.gradient.stop} style={shade} />
  <stop offset="1" style={shade} />
</linearGradient>
<path class="face" d={geometry.hull} fill={`url(#${id})`} />
{#if edge}<path class="edgeline" d={geometry.frontEdge} />{/if}
<path class="face" d={geometry.top} style={lit} />
