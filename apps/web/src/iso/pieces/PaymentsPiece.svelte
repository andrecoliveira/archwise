<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone, moving = false }: { tone: string; moving?: boolean } = $props();
  const CARD = { x0: -18, y0: -40, z0: 40, w: 56, d: 5, h: 46, r: 3 };
  const TERMINAL = { x0: -34, y0: -34, z0: 10, w: 68, d: 76, h: 40, r: 10 };
</script>

<!-- Card terminal with a card standing in its slot (external payments provider). -->
<IsoBox box={CARD} tone="var(--msg)" />
<Face face="left" box={CARD}>
  <rect x="0" y="8" width="56" height="8" class="magstripe" />
  <rect x="8" y="22" width="12" height="9" rx="2" class="chip" />
  <rect x="26" y="34" width="22" height="3" rx="1" class="txt" />
</Face>
<IsoBox box={TERMINAL} {tone} />
<Face face="top" box={TERMINAL}>
  <rect x="10" y="12" width="48" height="22" rx="4" class="screen" />
  <path d="M18 23h18" class="okline" stroke-dasharray="18" stroke-dashoffset="0">
    {#if moving}<animate attributeName="stroke-dashoffset" values="18;0;0" keyTimes="0;.7;1" dur="2.4s" repeatCount="indefinite" />{/if}
  </path>
  <text x="40" y="27" class="scrtxt">$
    {#if moving}<animate attributeName="opacity" values="0;0;1;1" keyTimes="0;.7;.72;1" dur="2.4s" repeatCount="indefinite" />{/if}
  </text>
  {#each [0, 1, 2] as row (row)}
    {#each [0, 1, 2] as col (col)}<rect x={12 + col * 16} y={42 + row * 10} width="12" height="7" rx="2" class="key" />{/each}
  {/each}
</Face>
<Face face="left" box={TERMINAL}><rect x="10" y="10" width="48" height="5" rx="2" class="slotdark" /></Face>
