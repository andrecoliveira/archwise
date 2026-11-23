import { expect, test } from 'vitest';
import { focusSet } from './focus.js';

const EDGES = [
  { source: 'web', target: 'api' },
  { source: 'api', target: 'db' },
  { source: 'api', target: 'cache' },
  { source: 'worker', target: 'cache' },
];

test('nothing selected means no focus', () => {
  expect(focusSet(EDGES, null)).toBeNull();
});

test('a selection focuses itself, its neighbours and the relations between them', () => {
  const focus = focusSet(EDGES, 'api')!;
  expect([...focus.nodes].sort()).toEqual(['api', 'cache', 'db', 'web']);
  expect([...focus.edges].sort()).toEqual(['api->cache', 'api->db', 'web->api']);
});

test('an isolated selection focuses only itself', () => {
  const focus = focusSet(EDGES, 'stripe')!;
  expect([...focus.nodes]).toEqual(['stripe']);
  expect(focus.edges.size).toBe(0);
});
