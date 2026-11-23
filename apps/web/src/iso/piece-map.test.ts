import { expect, test } from 'vitest';
import { PIECE_FILL, PIECES, pieceForNode, pieceForPreset } from './piece-map.js';

test('discovered kinds map to their pieces', () => {
  expect(pieceForNode({ type: 'service' })).toBe('service');
  expect(pieceForNode({ type: 'frontend' })).toBe('frontend');
  expect(pieceForNode({ type: 'datastore' })).toBe('datastore');
  expect(pieceForNode({ type: 'queue' })).toBe('queue');
  expect(pieceForNode({ type: 'job' })).toBe('job');
  expect(pieceForNode({ type: 'module' })).toBe('module');
});

test('external systems are a globe unless their category is payments', () => {
  expect(pieceForNode({ type: 'external-system' })).toBe('globe');
  expect(pieceForNode({ type: 'external-system', category: 'email' })).toBe('globe');
  expect(pieceForNode({ type: 'external-system', category: 'payments' })).toBe('payments');
});

test('an unknown kind gets the unknown piece', () => {
  expect(pieceForNode({ type: 'deployment-unit' })).toBe('unknown');
});

test('Sandbox presets map to pieces', () => {
  expect(pieceForPreset('client')).toEqual({ piece: 'frontend' });
  expect(pieceForPreset('app-server')).toEqual({ piece: 'service' });
  expect(pieceForPreset('worker')).toEqual({ piece: 'service', glyph: 'gear' });
  expect(pieceForPreset('database')).toEqual({ piece: 'datastore' });
  expect(pieceForPreset('queue')).toEqual({ piece: 'queue' });
  expect(pieceForPreset('cache')).toEqual({ piece: 'cache' });
  expect(pieceForPreset('load-balancer')).toEqual({ piece: 'load-balancer' });
  expect(pieceForPreset('mystery')).toEqual({ piece: 'unknown' });
});

test('every piece has a token fill', () => {
  for (const piece of PIECES) expect(PIECE_FILL[piece]).toMatch(/^var\(--kind-[a-z]+\)$/);
  expect(PIECE_FILL.payments).toBe('var(--kind-external)');
  expect(PIECE_FILL.cache).toBe('var(--kind-cache)');
});
