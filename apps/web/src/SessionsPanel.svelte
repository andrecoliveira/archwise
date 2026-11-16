<script lang="ts">
  import { tick } from 'svelte';
  import { listSessions, type SessionSummary } from './session-client.js';

  let {
    open = $bindable(false),
    currentId,
    onResume,
    onNew,
    onDelete,
    onRename,
  }: {
    open: boolean;
    currentId: string | null;
    onResume: (id: string) => Promise<string | null>;
    onNew: () => Promise<string | null>;
    onDelete: (id: string) => Promise<string | null>;
    onRename: (id: string, label: string) => Promise<string | null>;
  } = $props();

  let sessions: SessionSummary[] = $state([]);
  let loading = $state(false);
  let error = $state('');
  let confirmingId: string | null = $state(null);
  let renamingId: string | null = $state(null);
  let renameValue = $state('');
  let dialog: HTMLDivElement | null = $state(null);
  let opener: HTMLElement | null = null;

  /** Moves focus into the panel on open and back to whatever opened it on close. */
  $effect(() => {
    if (open) {
      const active = document.activeElement;
      opener = active instanceof HTMLElement ? active : null;
      void tick().then(() => dialog?.focus());
    }
  });

  function close(): void {
    open = false;
    const target = opener;
    opener = null;
    void tick().then(() => target?.focus());
  }

  async function focusIn(selector: string): Promise<void> {
    await tick();
    dialog?.querySelector<HTMLElement>(selector)?.focus();
  }

  async function refresh(): Promise<void> {
    loading = true;
    const result = await listSessions();
    loading = false;
    if (result.ok) {
      sessions = result.value;
      error = '';
    } else {
      error = 'Unable to load sessions.';
    }
  }

  $effect(() => {
    if (open) void refresh();
  });

  async function run(action: () => Promise<string | null>, closeOnSuccess: boolean): Promise<void> {
    const failure = await action();
    if (failure) {
      error = failure;
      return;
    }
    confirmingId = null;
    renamingId = null;
    if (closeOnSuccess) close();
    else await refresh();
  }

  const when = (iso: string): string => new Date(iso).toLocaleString();
</script>

{#if open}
  <div class="sessions-panel" role="dialog" aria-label="Sessions" aria-modal="false" tabindex="-1"
    bind:this={dialog} onkeydown={(event) => { if (event.key === 'Escape') close(); }}>
    <div class="sessions-heading">
      <h2>Sessions</h2>
      <div>
        <button type="button" onclick={() => void run(onNew, true)}>New session</button>
        <button type="button" onclick={close} aria-label="Close sessions">Close</button>
      </div>
    </div>
    <p class="sessions-hint">Sessions are saved locally, outside your project. Resuming one continues it where you left off.</p>
    {#if error}<p role="alert" class="sessions-error">{error}</p>{/if}
    {#if loading && sessions.length === 0}
      <p role="status">Loading sessions…</p>
    {:else if sessions.length === 0}
      <p role="status">No saved sessions yet. Changes in this session are saved as soon as you edit the Sandbox.</p>
    {:else}
      <ul class="session-list" aria-label="Saved sessions">
        {#each sessions as session (session.id)}
          <li class="session-row" class:current={session.id === currentId}>
            {#if renamingId === session.id}
              <form onsubmit={(event) => { event.preventDefault(); void run(() => onRename(session.id, renameValue), false); }}>
                <label class="visually-hidden" for={`rename-${session.id}`}>Session name</label>
                <input id={`rename-${session.id}`} bind:value={renameValue} maxlength="256"
                  onkeydown={(event) => {
                    if (event.key === 'Escape') {
                      event.stopPropagation();
                      renamingId = null;
                    }
                  }} />
                <button type="submit">Save</button>
                <button type="button" onclick={() => (renamingId = null)}>Cancel</button>
              </form>
            {:else}
              <div class="session-title">
                <strong>{session.label}</strong>
                {#if session.id === currentId}<span class="badge">Current</span>{/if}
                {#if session.hasSnapshots}<span class="badge">A/B</span>{/if}
                {#if !session.baseIsCurrent}<span class="badge warning">Architecture changed</span>{/if}
              </div>
              <small>{session.componentCount} component{session.componentCount === 1 ? '' : 's'} · updated {when(session.updatedAt)}</small>
            {/if}
            <div class="session-actions">
              {#if confirmingId === session.id}
                <span>Delete this session?</span>
                <button type="button" data-confirm-delete
                  onclick={() => void run(() => onDelete(session.id), session.id === currentId)}>Confirm delete</button>
                <button type="button" onclick={() => (confirmingId = null)}>Keep</button>
              {:else}
                <button type="button" disabled={session.id === currentId}
                  onclick={() => void run(() => onResume(session.id), true)}>Resume</button>
                <button type="button" onclick={() => { renamingId = session.id; renameValue = session.label; void focusIn(`#rename-${session.id}`); }}>Rename</button>
                <button type="button" onclick={() => { confirmingId = session.id; void focusIn('[data-confirm-delete]'); }}>Delete</button>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
