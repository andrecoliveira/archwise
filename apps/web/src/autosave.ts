import type { ClientResult } from './session-client.js';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'disabled';

export interface AutosaveStatus {
  readonly state: SaveState;
  readonly message: string;
}

export interface Autosave {
  schedule(text: string): void;
  flush(options?: { readonly keepalive?: boolean }): Promise<void>;
  retry(): void;
  dispose(): void;
}

export interface AutosaveOptions {
  readonly save: (text: string, keepalive: boolean) => Promise<ClientResult<unknown>>;
  readonly onStatus: (status: AutosaveStatus) => void;
  readonly delayMs?: number;
  /** Treat the first scheduled text (the initial render) as already saved. */
  readonly ignoreFirst?: boolean;
}

const SAVED: AutosaveStatus = { state: 'saved', message: 'All changes saved' };
const SAVING: AutosaveStatus = { state: 'saving', message: 'Saving…' };
const FAILED: AutosaveStatus = { state: 'unsaved', message: 'Not saved — retrying on next change' };
const CONFLICT: AutosaveStatus = {
  state: 'unsaved',
  message: 'This session changed elsewhere. Reload to continue.',
};

/**
 * Debounced, single-flight autosave. In-memory state is never discarded: a failure only
 * changes the reported status, and the newest text is always the one eventually saved.
 */
export function createAutosave(options: AutosaveOptions): Autosave {
  const delay = options.delayMs ?? 750;
  let pending: string | null = null;
  let lastSaved: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let blocked = false;
  let first = options.ignoreFirst === true;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function run(keepalive: boolean): Promise<void> {
    clearTimer();
    if (disposed || inFlight || pending === null) return;
    if (pending === lastSaved) {
      pending = null;
      options.onStatus(SAVED);
      return;
    }
    const text = pending;
    pending = null;
    inFlight = true;
    options.onStatus(SAVING);
    const result = await options.save(text, keepalive);
    inFlight = false;
    if (disposed) return;
    if (result.ok) {
      lastSaved = text;
      if (pending !== null && pending !== lastSaved) {
        await run(false);
        return;
      }
      pending = null;
      options.onStatus(SAVED);
      return;
    }
    pending ??= text;
    if (result.status === 404) {
      blocked = true;
      options.onStatus(CONFLICT);
    } else {
      options.onStatus(FAILED);
    }
  }

  return {
    schedule(text) {
      if (disposed) return;
      if (first) {
        first = false;
        lastSaved = text;
        return;
      }
      pending = text;
      if (blocked || inFlight) return;
      clearTimer();
      timer = setTimeout(() => void run(false), delay);
    },
    flush(flushOptions = {}) {
      if (blocked) return Promise.resolve();
      return run(flushOptions.keepalive === true);
    },
    retry() {
      blocked = false;
      void run(false);
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
