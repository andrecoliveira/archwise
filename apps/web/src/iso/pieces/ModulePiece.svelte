<script lang="ts">
  import Face from '../Face.svelte';
  import IsoBox from '../IsoBox.svelte';

  let { tone, mark = '{ }' }: { tone: string; moving?: boolean; mark?: string } = $props();
  const BOX = { x0: -44, y0: -44, z0: 10, w: 88, d: 88, h: 46, r: 8 };
</script>

<!-- Box with a glyph on top: `{ }` for a library, `?` for an unknown kind. -->
<IsoBox box={BOX} {tone} />
<Face face="top" box={BOX}><text x="44" y="52" class="glyph-text">{mark}</text></Face>
