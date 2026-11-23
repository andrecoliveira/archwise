<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone }: { tone: string; moving?: boolean } = $props();
  const BOX = { x0: -56, y0: -56, z0: 10, w: 112, d: 112, h: 22, r: 10 };
</script>

<!-- Low box whose top shows one arrow splitting into three (hypothetical load balancer). -->
<IsoBox box={BOX} {tone} />
<Face face="top" box={BOX}>
  <path d="M18 56H48M48 56 84 28M48 56H86M48 56 84 84" class="glyphline" />
  <path d="M76 24 86 26 82 35M78 50 88 56 78 62M76 88 86 86 82 77" class="glyphline" />
</Face>
