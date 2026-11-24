import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import StudioTopBar from './StudioTopBar.svelte';
import type { Chip } from './scan-status.js';

afterEach(cleanup);

const chip: Chip = { text: 'scanned just now · complete', status: 'complete', reasons: [] };

function props(overrides: Record<string, unknown> = {}) {
  return {
    workspace: 'shop',
    chip,
    scan: null,
    mode: 'explore' as const,
    search: '',
    theme: 'dark' as const,
    onToggleTheme: vi.fn(),
    saveStatus: { state: 'saved' as const, message: 'All changes saved' },
    onRetrySave: vi.fn(),
    storeEnabled: true,
    sessionsOpen: false,
    nodeStyle: 'pieces' as const,
    ...overrides,
  };
}

test('mode tabs switch and expose pressed state', async () => {
  render(StudioTopBar, props());
  const sandbox = screen.getByRole('button', { name: 'Sandbox' });
  expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-pressed')).toBe('true');
  await fireEvent.click(sandbox);
  expect(sandbox.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Explore' }).getAttribute('aria-pressed')).toBe(
    'false',
  );
  expect(screen.getByRole('group', { name: 'Studio mode' })).toBeTruthy();
});

test('theme button names the theme it switches to', async () => {
  const onToggleTheme = vi.fn();
  render(StudioTopBar, props({ onToggleTheme }));
  await fireEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
  expect(onToggleTheme).toHaveBeenCalledOnce();
});

test('the light theme offers the dark one', () => {
  render(StudioTopBar, props({ theme: 'light' }));
  expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
});

test('workspace shows the repository label', () => {
  render(StudioTopBar, props({ workspace: 'shop' }));
  expect(screen.getByText('shop')).toBeTruthy();
});

test('search input is labelled and advertises its shortcuts', () => {
  render(StudioTopBar, props());
  const search = screen.getByRole('searchbox', { name: 'Find component' });
  expect(search.getAttribute('aria-keyshortcuts')).toBe('/ Control+K Meta+K');
});

test('Sessions appears only with the store enabled', () => {
  const { unmount } = render(StudioTopBar, props({ storeEnabled: false }));
  expect(screen.queryByRole('button', { name: 'Sessions' })).toBeNull();
  unmount();
  render(StudioTopBar, props({ storeEnabled: true }));
  expect(screen.getByRole('button', { name: 'Sessions' })).toBeTruthy();
});

test('the revision chip text is shown', () => {
  render(StudioTopBar, props());
  expect(screen.getByText(/scanned just now · complete/)).toBeTruthy();
});

test('node style buttons switch and expose pressed state', async () => {
  render(StudioTopBar, props());
  const group = screen.getByRole('group', { name: 'Node style' });
  expect(screen.getByRole('button', { name: 'Pieces' }).getAttribute('aria-pressed')).toBe('true');
  await fireEvent.click(screen.getByRole('button', { name: 'Cards' }));
  expect(screen.getByRole('button', { name: 'Cards' }).getAttribute('aria-pressed')).toBe('true');
  expect(group).toBeTruthy();
});
