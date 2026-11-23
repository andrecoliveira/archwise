<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone, moving = false }: { tone: string; moving?: boolean } = $props();
  const BASE = { x0: -56, y0: -34, z0: 10, w: 112, d: 80, h: 7, r: 8 };
  const SCREEN = { x0: -56, y0: -46, z0: 17, w: 112, d: 8, h: 78, r: 4 };
  const baseTone = $derived(`color-mix(in srgb, ${tone} 45%, var(--plinth))`);
  const screenTone = $derived(`color-mix(in srgb, ${tone} 40%, var(--plinth))`);
</script>

<!-- Open laptop showing a browser window. -->
<IsoBox box={BASE} tone={baseTone} />
<Face face="top" box={BASE}>
  <rect x="10" y="16" width="92" height="40" rx="5" class="keys" />
  <rect x="38" y="62" width="36" height="10" rx="3" class="keys" />
</Face>
<IsoBox box={SCREEN} tone={screenTone} />
<Face face="left" box={SCREEN}>
  <rect x="6" y="6" width={SCREEN.w - 12} height={SCREEN.h - 12} rx="4" class="screen" />
  <rect x="6" y="6" width={SCREEN.w - 12} height="12" rx="4" class="chrome" />
  <circle cx="14" cy="12" r="2.2" class="dot1" />
  <circle cx="21" cy="12" r="2.2" class="dot2" />
  <circle cx="28" cy="12" r="2.2" class="dot3" />
  <rect x="14" y="26" width="44" height="8" rx="2" style:fill={tone} />
  <rect x="66" y="26" width="32" height="8" rx="2" class="txt" />
  <rect x="14" y="40" width="84" height="5" rx="2" class="txt" />
  <rect x="14" y="50" width="64" height="5" rx="2" class="txt" />
  <rect x="14" y="60" width="3" height="7" class="cursor">
    {#if moving}<animate attributeName="opacity" values="1;1;0;0" keyTimes="0;.5;.5;1" dur="1s" repeatCount="indefinite" />{/if}
  </rect>
</Face>
