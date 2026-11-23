<script lang="ts">
  import RevisionChip from './RevisionChip.svelte';
  import type { AutosaveStatus } from './autosave.js';
  import type { Chip } from './scan-status.js';
  import type { ScanSummaryView } from './scan-summary.js';
  import type { StudioMode } from './studio-mode.js';
  import type { Theme } from './theme.js';

  let {
    workspace,
    chip,
    scan,
    mode = $bindable<StudioMode>('explore'),
    search = $bindable(''),
    searchInput = $bindable<HTMLInputElement | null>(null),
    theme,
    onToggleTheme,
    saveStatus,
    onRetrySave,
    storeEnabled,
    sessionsOpen = $bindable(false),
  }: {
    workspace: string;
    chip: Chip;
    scan: ScanSummaryView | null;
    mode: StudioMode;
    search: string;
    searchInput?: HTMLInputElement | null;
    theme: Theme;
    onToggleTheme: () => void;
    saveStatus: AutosaveStatus;
    onRetrySave: () => void;
    storeEnabled: boolean;
    sessionsOpen: boolean;
  } = $props();

  const otherTheme = $derived(theme === 'dark' ? 'light' : 'dark');
</script>

<header class="topbar">
  <div class="topbar-brand">
    <svg viewBox="0 0 32 32" aria-hidden="true" class="topbar-logo">
      <path d="M16 3 28 10v12L16 29 4 22V10Z" fill="var(--accent)" stroke="var(--stroke)" stroke-width="1.8" stroke-linejoin="round" />
      <path d="M16 16 28 10M16 16 4 10M16 16v13" stroke="var(--stroke)" stroke-width="1.8" />
    </svg>
    <strong>Archwise</strong>
    <span class="topbar-workspace" title={workspace}>/ <span>{workspace}</span></span>
  </div>
  <RevisionChip {chip} {scan} />
  <div class="topbar-modes" role="group" aria-label="Studio mode">
    <button type="button" aria-pressed={mode === 'explore'} onclick={() => (mode = 'explore')}>Explore</button>
    <button type="button" aria-pressed={mode === 'sandbox'} onclick={() => (mode = 'sandbox')}>Sandbox</button>
  </div>
  <div class="topbar-spacer"></div>
  {#if mode === 'explore'}
    <input class="topbar-search" type="search" bind:value={search} bind:this={searchInput}
      placeholder="Find component…  /" aria-label="Find component" aria-keyshortcuts="/ Control+K Meta+K" />
  {/if}
  <span class="save-indicator" data-state={saveStatus.state} role="status" aria-live="polite" title={saveStatus.message}>{saveStatus.message}</span>
  {#if saveStatus.state === 'unsaved' && !saveStatus.message.includes('Reload')}
    <button type="button" onclick={onRetrySave}>Retry</button>
  {/if}
  {#if storeEnabled}
    <button type="button" onclick={() => (sessionsOpen = !sessionsOpen)} aria-expanded={sessionsOpen}>Sessions</button>
  {/if}
  <button type="button" class="topbar-theme" onclick={onToggleTheme} aria-label={`Switch to ${otherTheme} theme`}
    title={`Switch to ${otherTheme} theme`}>◐</button>
</header>
