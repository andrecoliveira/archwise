<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';

  /** Refits the viewport whenever `trigger` changes (after an automatic layout). */
  let { trigger }: { trigger: number } = $props();
  const { fitView } = useSvelteFlow();

  $effect(() => {
    if (trigger === 0) return;
    // Wait two frames so new positions and node sizes are measured before fitting.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => void fitView({ padding: 0.15, maxZoom: 1 }));
    });
    return () => cancelAnimationFrame(frame);
  });
</script>
