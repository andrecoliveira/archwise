import { expect, test } from 'vitest';
import {
  NODE_SIZE,
  NODE_STYLE_LIMIT,
  nodeStyleFor,
  readNodeStyle,
  writeNodeStyle,
} from './node-style.js';

test('the System view defaults to pieces', () => {
  expect(nodeStyleFor('system', 7, null)).toBe('pieces');
});

test('All packages and Sandbox default to cards', () => {
  expect(nodeStyleFor('all', 7, null)).toBe('cards');
  expect(nodeStyleFor('sandbox', 3, null)).toBe('cards');
});

test('more than 80 components defaults to cards', () => {
  expect(NODE_STYLE_LIMIT).toBe(80);
  expect(nodeStyleFor('system', 80, null)).toBe('pieces');
  expect(nodeStyleFor('system', 81, null)).toBe('cards');
});

test('the stored choice wins', () => {
  expect(nodeStyleFor('system', 500, 'pieces')).toBe('pieces');
  expect(nodeStyleFor('all', 3, 'pieces')).toBe('pieces');
});

test('choices are stored per view', () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  writeNodeStyle(storage, 'all', 'pieces');
  expect(store.get('archwise.nodeStyle.all')).toBe('pieces');
  expect(readNodeStyle(storage, 'all')).toBe('pieces');
  expect(readNodeStyle(storage, 'system')).toBeNull();
});

test('readNodeStyle ignores unknown values', () => {
  expect(readNodeStyle({ getItem: () => 'isometric' }, 'system')).toBeNull();
});

test('storage errors are swallowed', () => {
  const throwing = {
    getItem: (): string | null => {
      throw new Error('denied');
    },
    setItem: (): void => {
      throw new Error('quota');
    },
  };
  expect(readNodeStyle(throwing, 'system')).toBeNull();
  expect(() => writeNodeStyle(throwing, 'system', 'cards')).not.toThrow();
  expect(readNodeStyle(null, 'system')).toBeNull();
});

test('node sizes match the drawings', () => {
  expect(NODE_SIZE).toEqual({
    pieces: { width: 232, height: 236 },
    cards: { width: 200, height: 92 },
  });
});
