<script lang="ts">
  import type { ScanNotesView } from './scan-notes.js';

  let { view }: { view: ScanNotesView } = $props();
  const empty = $derived(view.gaps.length === 0 && view.notes.length === 0);
</script>

<section class="scan-notes" aria-label="Scan notes">
  <h2 id="scan-notes-heading" tabindex="-1">Scan notes</h2>
  <p class="scan-notes-headline">{view.headline}</p>
  {#if !empty}
    <ul>
      {#each view.gaps as gap, i (i)}
        <li><code title={gap.path}>{gap.path}</code> <span>— not analyzed: {gap.reason}</span></li>
      {/each}
      {#each view.notes as note, i (i)}
        <li>{note}</li>
      {/each}
    </ul>
  {/if}
</section>
