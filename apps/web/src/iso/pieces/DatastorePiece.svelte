<script lang="ts">
  import IsoCylinder from '../IsoCylinder.svelte';

  let { tone }: { tone: string; moving?: boolean } = $props();
</script>

<!-- Cylinder of stacked disks. -->
<IsoCylinder z0={10} r={46} h={72} bands={3} {tone} />
