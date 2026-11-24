import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import CounterBar from './CounterBar.svelte';

afterEach(cleanup);

const counters = {
  components: { total: 7, inferred: 3 },
  relations: { total: 8, inferred: 5 },
  files: 1,
  notes: 2,
};

test('activating "3 inferred" filters and activating it again clears', async () => {
  const onFilter = vi.fn();
  const { rerender } = render(CounterBar, {
    props: { counters, filter: null, onFilter, onShowNotes: vi.fn() },
  });
  expect(screen.getByText('7 components')).toBeTruthy();
  const inferred = screen.getByRole('button', { name: '3 inferred components' });
  expect(inferred.getAttribute('aria-pressed')).toBe('false');
  await fireEvent.click(inferred);
  expect(onFilter).toHaveBeenLastCalledWith('inferred-components');
  await rerender({ counters, filter: 'inferred-components', onFilter, onShowNotes: vi.fn() });
  const pressed = screen.getByRole('button', { name: '3 inferred components' });
  expect(pressed.getAttribute('aria-pressed')).toBe('true');
  await fireEvent.click(pressed);
  expect(onFilter).toHaveBeenLastCalledWith(null);
  await fireEvent.click(screen.getByRole('button', { name: '5 inferred relations' }));
  expect(onFilter).toHaveBeenLastCalledWith('inferred-relations');
});

test('activating "1 file not analyzed" shows the scan notes', async () => {
  const onShowNotes = vi.fn();
  render(CounterBar, { props: { counters, filter: null, onFilter: vi.fn(), onShowNotes } });
  await fireEvent.click(screen.getByRole('button', { name: '1 file not analyzed · 2 notes' }));
  expect(onShowNotes).toHaveBeenCalled();
});

test('no inferred split, no filter button', () => {
  render(CounterBar, {
    props: {
      counters: { ...counters, components: { total: 2, inferred: 0 }, files: 0, notes: 0 },
      filter: null,
      onFilter: vi.fn(),
      onShowNotes: vi.fn(),
    },
  });
  expect(screen.queryByRole('button', { name: /inferred components/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /not analyzed|notes/ })).toBeNull();
});
