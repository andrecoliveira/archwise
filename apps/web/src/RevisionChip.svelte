<script lang="ts">
  import type { Chip } from './scan-status.js';
  import { repositoryLines, skippedLine, type ScanSummaryView } from './scan-summary.js';

  let { chip, scan }: { chip: Chip; scan: ScanSummaryView | null } = $props();
</script>

<details class="revision-chip" data-status={chip.status}>
  <summary>
    <span class="revision-chip-status" aria-hidden="true">{chip.status === 'complete' ? '✓' : '!'}</span>
    {chip.text}
  </summary>
  <div class="revision-chip-panel" role="group" aria-label="Scan details">
    <h2>Scan details</h2>
    {#if chip.reasons.length > 0}
      <p>Partial because:</p>
      <ul>{#each chip.reasons as reason, i (i)}<li>{reason}</li>{/each}</ul>
    {/if}
    {#if scan}
      <ul>{#each repositoryLines(scan) as line, i (i)}<li>{line}</li>{/each}</ul>
      {#if skippedLine(scan)}<p>{skippedLine(scan)}</p>{/if}
    {:else}
      <p>No scan summary from the local server.</p>
    {/if}
  </div>
</details>
