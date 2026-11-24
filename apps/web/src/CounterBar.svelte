<script lang="ts">
  import { scanLabel, totalLabel, type CounterView, type Filter } from './counters.js';

  let {
    counters,
    filter,
    onFilter,
    onShowNotes,
  }: {
    counters: CounterView;
    filter: Filter | null;
    onFilter: (filter: Filter | null) => void;
    onShowNotes: () => void;
  } = $props();

  const toggle = (next: Filter): void => onFilter(filter === next ? null : next);
  const scan = $derived(scanLabel(counters));
</script>

<!-- Each count states its unit; the inferred splits and the scan notes are filters. -->
<div class="counter-bar" role="group" aria-label="Counts">
  <span class="counter">
    <span>{totalLabel(counters.components.total, 'component')}</span>
    {#if counters.components.inferred > 0}
      <span aria-hidden="true">·</span>
      <button type="button" class="counter-filter" aria-pressed={filter === 'inferred-components'}
        aria-label={`${counters.components.inferred} inferred components`}
        onclick={() => toggle('inferred-components')}>{counters.components.inferred} inferred</button>
    {/if}
  </span>
  <span class="counter">
    <span>{totalLabel(counters.relations.total, 'relation')}</span>
    {#if counters.relations.inferred > 0}
      <span aria-hidden="true">·</span>
      <button type="button" class="counter-filter" aria-pressed={filter === 'inferred-relations'}
        aria-label={`${counters.relations.inferred} inferred relations`}
        onclick={() => toggle('inferred-relations')}>{counters.relations.inferred} inferred</button>
    {/if}
  </span>
  {#if scan}
    <button type="button" class="counter-filter" onclick={onShowNotes}>{scan}</button>
  {/if}
</div>
