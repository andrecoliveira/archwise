<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone, moving = false, glyph }: { tone: string; moving?: boolean; glyph?: 'gear' } = $props();
  const BOX = { x0: -42, y0: -42, z0: 10, w: 84, d: 84, h: 78, r: 8 };
  const UNITS = [0, 1, 2];
</script>

<!-- Server cabinet: rack units with LEDs on the front, vents on the side, a glyph on top. -->
<IsoBox box={BOX} {tone} />
<Face face="left" box={BOX}>
  {#each UNITS as i (i)}
    {@const v = 12 + i * 21}
    <rect x="9" y={v} width={BOX.w - 18} height="14" rx="3" class="slot" />
    <path d={`M15 ${v + 7}h28`} class="slotline" />
    <circle cx={BOX.w - 18} cy={v + 7} r="2.6" class="led">
      {#if moving}<animate attributeName="opacity" values="1;.25;1" dur={`${1.1 + i * 0.37}s`} repeatCount="indefinite" />{/if}
    </circle>
    <circle cx={BOX.w - 27} cy={v + 7} r="2.6" class="led2">
      {#if moving}<animate attributeName="opacity" values=".3;1;.3" dur={`${1.7 + i * 0.23}s`} begin={`${i * 0.4}s`} repeatCount="indefinite" />{/if}
    </circle>
  {/each}
</Face>
<Face face="right" box={BOX}>
  {#each [0, 1, 2, 3, 4, 5] as i (i)}<path d={`M${14 + i * 11} 14v${BOX.h - 30}`} class="vent" />{/each}
</Face>
<Face face="top" box={BOX}>
  <rect x="22" y="22" width="40" height="40" rx="8" class="topmark" />
  {#if glyph === 'gear'}
    <g class="glyph-gear">
      <circle cx="42" cy="42" r="9" class="glyphline" />
      {#each [0, 60, 120, 180, 240, 300] as a (a)}
        <path d={`M${42 + 9 * Math.cos((a * Math.PI) / 180)} ${42 + 9 * Math.sin((a * Math.PI) / 180)}L${42 + 15 * Math.cos((a * Math.PI) / 180)} ${42 + 15 * Math.sin((a * Math.PI) / 180)}`} class="glyphline" />
      {/each}
    </g>
  {:else}
    <path d="M33 36l8 6-8 6M45 50h9" class="glyphline" />
  {/if}
</Face>
