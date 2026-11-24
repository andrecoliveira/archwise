<script lang="ts">
  import ModulePiece from './ModulePiece.svelte';

  let { tone }: { tone: string; moving?: boolean } = $props();
</script>

<ModulePiece {tone} mark="?" />
