<script lang="ts">
  // Test stand-in for Svelte Flow's BaseEdge: draws the path with the attributes it receives.
  let { path, ...rest }: { path: string } & Record<string, unknown> = $props();
</script>

<path d={path} {...rest} />
