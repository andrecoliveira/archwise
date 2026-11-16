import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createAutosave, type AutosaveStatus } from './autosave.js';
import type { ClientResult } from './session-client.js';

let statuses: AutosaveStatus[];
let save: ReturnType<
  typeof vi.fn<(text: string, keepalive: boolean) => Promise<ClientResult<unknown>>>
>;
const ok = (): Promise<ClientResult<unknown>> => Promise.resolve({ ok: true, value: null });

beforeEach(() => {
  vi.useFakeTimers();
  statuses = [];
  save = vi.fn(ok);
});
afterEach(() => {
  vi.useRealTimers();
});

const make = () => createAutosave({ save, onStatus: (s) => statuses.push(s) });
const last = () => statuses[statuses.length - 1];

test('debounces bursts into one save of the latest text', async () => {
  const autosave = make();
  autosave.schedule('a');
  autosave.schedule('b');
  autosave.schedule('c');
  await vi.advanceTimersByTimeAsync(749);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith('c', false);
  expect(last()).toEqual({ state: 'saved', message: 'All changes saved' });
});

test('reports saving while a request is in flight', async () => {
  let resolve!: (r: ClientResult<unknown>) => void;
  save.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  expect(last()?.state).toBe('saving');
  resolve({ ok: true, value: null });
  await vi.runAllTimersAsync();
  expect(last()?.state).toBe('saved');
});

test('a failed save keeps changes and retries on the next change', async () => {
  save.mockResolvedValueOnce({ ok: false, status: 500, error: 'HTTP 500' });
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  expect(last()).toEqual({ state: 'unsaved', message: 'Not saved — retrying on next change' });
  autosave.schedule('b');
  await vi.advanceTimersByTimeAsync(750);
  expect(save).toHaveBeenLastCalledWith('b', false);
  expect(last()?.state).toBe('saved');
});

test('retry saves the pending text immediately', async () => {
  save.mockResolvedValueOnce({ ok: false, status: 0, error: 'network' });
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  autosave.retry();
  await vi.runAllTimersAsync();
  expect(save).toHaveBeenCalledTimes(2);
  expect(last()?.state).toBe('saved');
});

test('a 404 stops autosave until an explicit retry', async () => {
  save.mockResolvedValueOnce({ ok: false, status: 404, error: 'not-found' });
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  expect(last()).toEqual({
    state: 'unsaved',
    message: 'This session changed elsewhere. Reload to continue.',
  });
  autosave.schedule('b');
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(1);
});

test('changes during an in-flight save trigger a follow-up save of the latest text', async () => {
  let resolve!: (r: ClientResult<unknown>) => void;
  save.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  autosave.schedule('b');
  await vi.advanceTimersByTimeAsync(750);
  expect(save).toHaveBeenCalledTimes(1);
  resolve({ ok: true, value: null });
  await vi.runAllTimersAsync();
  expect(save).toHaveBeenCalledTimes(2);
  expect(save).toHaveBeenLastCalledWith('b', false);
});

test('identical text is not saved twice', async () => {
  const autosave = make();
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  autosave.schedule('a');
  await vi.advanceTimersByTimeAsync(750);
  expect(save).toHaveBeenCalledTimes(1);
  expect(last()?.state).toBe('saved');
});

test('flush saves pending text immediately with keepalive', async () => {
  const autosave = make();
  autosave.schedule('a');
  await autosave.flush({ keepalive: true });
  expect(save).toHaveBeenCalledWith('a', true);
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(1);
});

test('dispose cancels a pending save', async () => {
  const autosave = make();
  autosave.schedule('a');
  autosave.dispose();
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).not.toHaveBeenCalled();
});

test('ignoreFirst treats the initial render as already saved', async () => {
  const autosave = createAutosave({ save, onStatus: (s) => statuses.push(s), ignoreFirst: true });
  autosave.schedule('initial');
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).not.toHaveBeenCalled();
  autosave.schedule('initial');
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).not.toHaveBeenCalled();
  autosave.schedule('edited');
  await vi.advanceTimersByTimeAsync(750);
  expect(save).toHaveBeenCalledWith('edited', false);
});
