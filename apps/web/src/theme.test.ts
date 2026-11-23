import { expect, test } from 'vitest';
import { THEME_KEY, applyTheme, nextTheme, readTheme, writeTheme } from './theme.js';

test('readTheme defaults to dark', () => {
  expect(readTheme({ getItem: () => null })).toBe('dark');
});

test('readTheme returns a stored light theme', () => {
  expect(readTheme({ getItem: (key) => (key === THEME_KEY ? 'light' : null) })).toBe('light');
});

test('readTheme ignores unknown stored values', () => {
  expect(readTheme({ getItem: () => 'neon' })).toBe('dark');
});

test('readTheme returns dark when storage throws', () => {
  const storage = {
    getItem: (): string | null => {
      throw new Error('denied');
    },
  };
  expect(readTheme(storage)).toBe('dark');
});

test('readTheme returns dark without storage', () => {
  expect(readTheme(null)).toBe('dark');
});

test('writeTheme stores the theme under its key', () => {
  const written: [string, string][] = [];
  writeTheme({ setItem: (key, value) => void written.push([key, value]) }, 'light');
  expect(written).toEqual([[THEME_KEY, 'light']]);
});

test('writeTheme swallows storage errors', () => {
  const storage = {
    setItem: (): void => {
      throw new Error('quota');
    },
  };
  expect(() => writeTheme(storage, 'light')).not.toThrow();
  expect(() => writeTheme(null, 'light')).not.toThrow();
});

test('applyTheme sets data-theme', () => {
  const root = document.createElement('html');
  applyTheme(root, 'light');
  expect(root.dataset.theme).toBe('light');
});

test('nextTheme toggles', () => {
  expect(nextTheme('dark')).toBe('light');
  expect(nextTheme('light')).toBe('dark');
});
