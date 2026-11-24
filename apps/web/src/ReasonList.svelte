<script lang="ts">
  import { describeReason, type ReasonContext } from './reason-catalog.js';

  let { reasons, context }: { reasons: readonly string[]; context: ReasonContext } = $props();
  const views = $derived(reasons.map((code) => describeReason(code, context)));
</script>

<ul class="reason-list">
  {#each views as view, i (i)}
    <li>
      <span class="reason-sentence">{#each view.parts as part, j (j)}{#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}</span>{#if view.file}<span class="reason-file"> · {view.file}</span>{/if}
      <code class="reason-code">{view.code}</code>
    </li>
  {/each}
</ul>
