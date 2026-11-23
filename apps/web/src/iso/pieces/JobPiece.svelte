<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone }: { tone: string; moving?: boolean } = $props();
  const BOX = { x0: -40, y0: -40, z0: 10, w: 80, d: 80, h: 64, r: 8 };
</script>

<!-- Cube with a clock face (scheduled job). -->
<IsoBox box={BOX} {tone} />
<Face face="left" box={BOX}>
  <circle cx="40" cy="32" r="22" class="clockface" />
  <path d="M40 32V18M40 32l10 6" class="glyphline" />
</Face>
