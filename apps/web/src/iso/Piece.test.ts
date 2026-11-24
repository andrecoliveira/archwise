import { cleanup, render } from '@testing-library/svelte';
import { afterEach, expect, test, vi } from 'vitest';
import { PIECES } from './piece-map.js';

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }));
vi.mock('svelte/motion', () => motion);
const { default: Piece } = await import('./Piece.svelte');

afterEach(() => {
  cleanup();
  motion.prefersReducedMotion.current = false;
});

const ANIMATION = 'animate, animateTransform, animateMotion';

function draw(props: Record<string, unknown>): Element {
  const { container } = render(Piece, props);
  return container;
}

test('every piece renders its own drawing', () => {
  for (const piece of PIECES) {
    const container = draw({ piece });
    const g = container.querySelector(`g.iso-piece[data-piece="${piece}"]`);
    expect(g, piece).not.toBeNull();
    expect(g!.querySelectorAll('path, ellipse, circle').length, piece).toBeGreaterThan(0);
    cleanup();
  }
});

test('inferred pieces are marked for a dashed outline', () => {
  expect(
    draw({ piece: 'datastore', inferred: true }).querySelector('g.iso-piece.inferred'),
  ).not.toBeNull();
});

test('the queue animates its envelopes when motion is allowed', () => {
  expect(
    draw({ piece: 'queue', animated: true }).querySelectorAll(ANIMATION).length,
  ).toBeGreaterThan(0);
});

test('pieces render no animation under reduced motion', () => {
  motion.prefersReducedMotion.current = true;
  for (const piece of ['queue', 'service', 'frontend', 'payments'] as const) {
    expect(draw({ piece, animated: true }).querySelectorAll(ANIMATION).length, piece).toBe(0);
    cleanup();
  }
});

test('pieces are static unless asked to animate', () => {
  expect(draw({ piece: 'queue' }).querySelectorAll(ANIMATION).length).toBe(0);
});

test('a worker carries the gear glyph', () => {
  expect(draw({ piece: 'service', glyph: 'gear' }).querySelector('.glyph-gear')).not.toBeNull();
});
