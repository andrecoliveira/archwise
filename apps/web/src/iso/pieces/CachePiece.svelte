<script lang="ts">
  import Face from '../Face.svelte';
  import IsoCylinder from '../IsoCylinder.svelte';

  let { tone }: { tone: string; moving?: boolean } = $props();
  const TOP = { x0: -46, y0: -46, z0: 10, w: 92, d: 92, h: 36 };
</script>

<!-- Short cylinder with a lightning bolt (hypothetical cache). -->
<IsoCylinder z0={10} r={46} h={36} {tone} />
<Face face="top" box={TOP}><path d="M50 18 34 48h12l-6 26 20-34H48Z" class="bolt" /></Face>
