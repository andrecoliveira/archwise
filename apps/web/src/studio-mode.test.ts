import { expect, test } from 'vitest';
import { discoveredNode, graphOf } from './graph-fixtures.js';
import { initialMode, isSearchShortcut } from './studio-mode.js';

const key = (
  key: string,
  target: EventTarget | null,
  mods: { metaKey?: boolean; ctrlKey?: boolean } = {},
) => ({
  key,
  metaKey: mods.metaKey ?? false,
  ctrlKey: mods.ctrlKey ?? false,
  target,
});

test('initialMode opens Explore when components exist', () => {
  expect(initialMode(graphOf([discoveredNode('package:package.json')]))).toBe('explore');
});

test('initialMode opens Sandbox for an empty project', () => {
  expect(initialMode(graphOf([]))).toBe('sandbox');
});

test('slash focuses search', () => {
  expect(isSearchShortcut(key('/', document.body))).toBe(true);
});

test('cmd-k and ctrl-k focus search', () => {
  expect(isSearchShortcut(key('k', document.body, { metaKey: true }))).toBe(true);
  expect(isSearchShortcut(key('k', document.body, { ctrlKey: true }))).toBe(true);
  expect(isSearchShortcut(key('k', document.body))).toBe(false);
});

test('typing a slash inside a field does not', () => {
  for (const tag of ['input', 'textarea', 'select']) {
    expect(isSearchShortcut(key('/', document.createElement(tag)))).toBe(false);
  }
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  expect(isSearchShortcut(key('/', editable))).toBe(false);
});

test('cmd-k works even inside a field', () => {
  expect(isSearchShortcut(key('k', document.createElement('input'), { metaKey: true }))).toBe(true);
});
