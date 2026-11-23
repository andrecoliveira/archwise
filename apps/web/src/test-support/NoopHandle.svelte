<script lang="ts">
  // Test stand-in for Svelte Flow's Handle, which needs the flow store. It renders nothing.
  let { ...rest }: Record<string, unknown> = $props();
</script>

<span hidden data-handle-props={Object.keys(rest).length}></span>
