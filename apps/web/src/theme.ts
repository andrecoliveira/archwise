/*
 * Studio colour theme. Dark is the default; the choice persists per browser. Storage can be
 * missing or throw (private windows, blocked site data), so every access is guarded and the
 * Studio always renders.
 */

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'archwise.theme';

/** The browser's localStorage, or null when it is unavailable or access throws. */
export function safeStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readTheme(storage: Pick<Storage, 'getItem'> | null): Theme {
  try {
    return storage?.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function writeTheme(storage: Pick<Storage, 'setItem'> | null, theme: Theme): void {
  try {
    storage?.setItem(THEME_KEY, theme);
  } catch {
    // The theme still applies for this page; it just is not remembered.
  }
}

export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.dataset.theme = theme;
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'dark' ? 'light' : 'dark';
}
