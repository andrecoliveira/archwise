import { expect, test } from 'vitest';
import { canvasKeyAction } from './canvas-keys.js';

const key = (
  k: string,
  target: EventTarget | null = document.body,
  mods: Partial<Record<'metaKey' | 'ctrlKey' | 'altKey', boolean>> = {},
) => ({
  key: k,
  target,
  metaKey: mods.metaKey ?? false,
  ctrlKey: mods.ctrlKey ?? false,
  altKey: mods.altKey ?? false,
});

test('arrow keys pan by 80 px', () => {
  expect(canvasKeyAction(key('ArrowLeft'))).toEqual({ pan: [80, 0] });
  expect(canvasKeyAction(key('ArrowRight'))).toEqual({ pan: [-80, 0] });
  expect(canvasKeyAction(key('ArrowUp'))).toEqual({ pan: [0, 80] });
  expect(canvasKeyAction(key('ArrowDown'))).toEqual({ pan: [0, -80] });
});

test('plus, equals and minus zoom; zero fits', () => {
  expect(canvasKeyAction(key('+'))).toEqual({ zoom: 'in' });
  expect(canvasKeyAction(key('='))).toEqual({ zoom: 'in' });
  expect(canvasKeyAction(key('-'))).toEqual({ zoom: 'out' });
  expect(canvasKeyAction(key('0'))).toEqual({ fit: true });
});

test('Enter on a node selects it', () => {
  const node = document.createElement('div');
  node.className = 'svelte-flow__node';
  node.dataset.id = 'package:apps/api/package.json';
  const inner = document.createElement('span');
  node.append(inner);
  expect(canvasKeyAction(key('Enter', node))).toEqual({ select: 'package:apps/api/package.json' });
  expect(canvasKeyAction(key('Enter', inner))).toEqual({ select: 'package:apps/api/package.json' });
});

test('Enter outside a node does nothing', () => {
  expect(canvasKeyAction(key('Enter'))).toBeNull();
});

test('keys typed in a field do nothing', () => {
  for (const tag of ['input', 'textarea', 'select']) {
    expect(canvasKeyAction(key('ArrowLeft', document.createElement(tag)))).toBeNull();
    expect(canvasKeyAction(key('0', document.createElement(tag)))).toBeNull();
  }
  const editable = document.createElement('div');
  editable.setAttribute('contenteditable', 'true');
  expect(canvasKeyAction(key('+', editable))).toBeNull();
});

test('a held modifier leaves the key to the browser', () => {
  expect(canvasKeyAction(key('0', document.body, { metaKey: true }))).toBeNull();
  expect(canvasKeyAction(key('+', document.body, { ctrlKey: true }))).toBeNull();
  expect(canvasKeyAction(key('ArrowLeft', document.body, { altKey: true }))).toBeNull();
});

test('other keys do nothing', () => {
  expect(canvasKeyAction(key('a'))).toBeNull();
});
