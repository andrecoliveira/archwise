import type { ClientResult } from './session-client.js';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'disabled';

export interface AutosaveStatus {
  readonly state: SaveState;
  readonly message: string;
}

export interface Autosave {
  schedule(text: string): void;
  /** Saves everything pending, waiting for any in-flight save. Resolves true when all is saved. */
  flush(options?: { readonly keepalive?: boolean }): Promise<boolean>;
  retry(): void;
  /** Stops saving for good and reports why (e.g. the stored Sandbox could not be restored). */
  halt(message: string): void;
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
  message: 'This session was deleted elsewhere. Reload to continue.',
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
  let inFlight: Promise<void> | null = null;
  let blocked = false;
  let halted = false;
  let failed = false;
  let first = options.ignoreFirst === true;
  let disposed = false;

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function saveOnce(text: string, keepalive: boolean): Promise<void> {
    options.onStatus(SAVING);
    const result = await options.save(text, keepalive);
    if (disposed) return;
    if (result.ok) {
      lastSaved = text;
      failed = false;
      if (pending === text) pending = null;
      return;
    }
    failed = true;
    pending ??= text;
    if (result.status === 404) {
      blocked = true;
      options.onStatus(CONFLICT);
    } else {
      options.onStatus(FAILED);
    }
  }

  /** Saves pending text until nothing new is pending, one request at a time. */
  async function run(keepalive: boolean): Promise<void> {
    clearTimer();
    while (!disposed && !halted && !blocked) {
      if (inFlight) {
        await inFlight;
        continue;
      }
      if (pending === null) return;
      if (pending === lastSaved) {
        pending = null;
        options.onStatus(SAVED);
        return;
      }
      const text = pending;
      inFlight = saveOnce(text, keepalive);
      await inFlight;
      inFlight = null;
      if (failed) return;
      if (pending === null || pending === lastSaved) {
        pending = null;
        options.onStatus(SAVED);
        return;
      }
    }
  }

  return {
    schedule(text) {
      if (disposed || halted) return;
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
    async flush(flushOptions = {}) {
      if (halted) return true;
      await run(flushOptions.keepalive === true);
      return !blocked && !failed && (pending === null || pending === lastSaved);
    },
    retry() {
      blocked = false;
      failed = false;
      void run(false);
    },
    halt(message) {
      halted = true;
      clearTimer();
      pending = null;
      options.onStatus({ state: 'unsaved', message });
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
