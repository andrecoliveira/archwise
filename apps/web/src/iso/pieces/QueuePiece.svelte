<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';
  import { C, S } from '../kit.js';
  import { isoId } from '../ids.js';

  let { tone, moving = false }: { tone: string; moving?: boolean } = $props();
  const TRAY = { x0: -62, y0: -30, z0: 10, w: 132, d: 60, h: 20, r: 10 };
  const TRAVEL = 100; // world units an envelope travels
  const DURATION = 4; // seconds
  const clip = isoId('belt');
  const dx = C * TRAVEL;
  const dy = S * TRAVEL;
  const trayTone = $derived(`color-mix(in srgb, ${tone} 55%, var(--plinth))`);
  const envelope = (x: number) => ({ x0: x, y0: -17, z0: 30, w: 30, d: 34, h: 4, r: 3 });
</script>

<!-- Conveyor belt carrying envelopes toward the arrow. -->
<IsoBox box={TRAY} tone={trayTone} />
<Face face="left" box={TRAY}>
  {#each [0, 1, 2, 3, 4, 5] as i (i)}
    {@const cx = 14 + i * 20}
    <circle {cx} cy="10" r="5.5" class="roller" />
    <path d={`M${cx - 4} 10h8`} class="spoke">
      {#if moving}<animateTransform attributeName="transform" type="rotate" from={`0 ${cx} 10`} to={`360 ${cx} 10`} dur="1.2s" repeatCount="indefinite" />{/if}
    </path>
  {/each}
</Face>
<Face face="top" box={TRAY}>
  <clipPath id={clip}><rect x="6" y="8" width={TRAY.w - 12} height={TRAY.d - 16} rx="5" /></clipPath>
  <rect x="6" y="8" width={TRAY.w - 12} height={TRAY.d - 16} rx="5" class="belt" />
  <g clip-path={`url(#${clip})`}>
    <g>
      {#each Array.from({ length: 13 }, (_, i) => i) as i (i)}<path d={`M${6 + i * 10} 10v${TRAY.d - 20}`} class="slat" />{/each}
      {#if moving}<animateTransform attributeName="transform" type="translate" from="0 0" to="10 0" dur={`${10 / (TRAVEL / DURATION)}s`} repeatCount="indefinite" />{/if}
    </g>
  </g>
  <path d={`M${TRAY.w - 22} ${TRAY.d / 2 - 9} ${TRAY.w - 10} ${TRAY.d / 2} ${TRAY.w - 22} ${TRAY.d / 2 + 9}`} class="flowarrow" />
</Face>
{#each [0, 1, 2] as i (i)}
  {@const box = envelope(-60)}
  {#if moving}
    <g opacity="0">
      <IsoBox {box} tone="var(--msg)" edge={false} />
      <Face face="top" {box}><path d="M3 4 15 18 27 4" class="flap" /><rect x="19" y="22" width="7" height="8" rx="1" style:fill={tone} /></Face>
      <animateTransform attributeName="transform" type="translate" from="0 0" to={`${dx} ${dy}`} dur={`${DURATION}s`} begin={`${-(DURATION * i) / 3}s`} repeatCount="indefinite" />
      <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.12;.85;1" dur={`${DURATION}s`} begin={`${-(DURATION * i) / 3}s`} repeatCount="indefinite" />
    </g>
  {:else}
    <g transform={`translate(${(dx * i) / 3} ${(dy * i) / 3})`}>
      <IsoBox {box} tone="var(--msg)" edge={false} />
      <Face face="top" {box}><path d="M3 4 15 18 27 4" class="flap" /><rect x="19" y="22" width="7" height="8" rx="1" style:fill={tone} /></Face>
    </g>
  {/if}
{/each}
