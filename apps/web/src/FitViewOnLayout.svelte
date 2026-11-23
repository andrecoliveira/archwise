<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte';

  /** Refits the viewport whenever `trigger` changes (after an automatic layout). */
  let { trigger }: { trigger: number } = $props();
  const { fitView } = useSvelteFlow();

  $effect(() => {
    if (trigger === 0) return;
    // Wait one frame so the laid-out positions are measured before fitting.
    const frame = requestAnimationFrame(() => void fitView({ padding: 0.15, maxZoom: 1 }));
    return () => cancelAnimationFrame(frame);
  });
</script>
