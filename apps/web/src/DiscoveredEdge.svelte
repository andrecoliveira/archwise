<script lang="ts">
  import { getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
  import { prefersReducedMotion } from 'svelte/motion';
  import { dotStopFraction } from './iso/kit.js';
  import { isoId } from './iso/ids.js';

  let { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps = $props();

  const marker = isoId('arrow');
  const [path] = $derived(
    getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 12, offset: 25 }),
  );
  const inferred = $derived(data?.confidence === 'inferred');
  const focused = $derived(data?.focused === true);
  // The travelling dot is decorative: only on focused relations, never under reduced motion.
  const moving = $derived(focused && data?.animated === true && !prefersReducedMotion.current);

  let line: SVGPathElement | null = $state(null);
  let length = $state(0);
  $effect(() => {
    void path;
    length = line?.getTotalLength?.() ?? 0;
  });
  const stop = $derived(dotStopFraction(length));
</script>

<g class="relation-group" class:dimmed={data?.dimmed === true}>
  <defs>
    <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" class="relation-arrow" class:focused />
    </marker>
  </defs>
  <path bind:this={line} d={path} class="relation" class:focused class:inferred
    stroke-dasharray={inferred ? '6 5' : undefined} marker-end={`url(#${marker})`} />
  {#if moving && stop.to > stop.from}
    <circle r="5" class="relation-dot">
      <animateMotion dur="1.8s" repeatCount="indefinite" {path} keyPoints={`${stop.from};${stop.to}`} keyTimes="0;1" calcMode="linear" />
    </circle>
  {/if}
</g>
