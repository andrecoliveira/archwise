<script lang="ts">
  import type { Snippet } from 'svelte';
  import { faceMatrix, type Box, type FaceName } from './kit.js';

  let { face, box, children }: { face: FaceName; box: Box; children: Snippet } = $props();
</script>

<!-- Draws its children in the face's own flat coordinates (u right, v down). -->
<g transform={faceMatrix(face, box)}>{@render children()}</g>
