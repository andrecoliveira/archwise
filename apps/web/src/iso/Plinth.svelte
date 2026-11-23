<script lang="ts">
  import IsoBox from './IsoBox.svelte';
  import { polygonPath, roundedFootprint } from './kit.js';
  import { isoId } from './ids.js';

  let { selected = false, proposed = false }: { selected?: boolean; proposed?: boolean } = $props();

  const BOX = { x0: -64, y0: -64, z0: 0, w: 128, d: 128, h: 12, r: 18 };
  const top = polygonPath(roundedFootprint(BOX.x0, BOX.y0, BOX.w, BOX.d, BOX.r, BOX.h));
  const hatch = isoId('hatch');
</script>

<g class="pl">
  <IsoBox box={BOX} tone="var(--plinth)" edge={false} />
  {#if proposed}
    <pattern id={hatch} patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">
      <path d="M0 0V9" class="hatch" />
    </pattern>
    <path class="hatched" d={top} fill={`url(#${hatch})`} />
  {/if}
</g>
<path class="selring" class:selected d={top} />
