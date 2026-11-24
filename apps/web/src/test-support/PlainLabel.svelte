<script lang="ts">
  import type { Snippet } from 'svelte';

  // Test stand-in for Svelte Flow's EdgeLabel, which needs a flow store and a portal.
  let { children, class: className = '' }: { children?: Snippet; class?: string } = $props();
</script>

<div class={className}>{@render children?.()}</div>
