import { cleanup, render } from '@testing-library/svelte';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

const motion = vi.hoisted(() => ({ prefersReducedMotion: { current: false } }));
vi.mock('svelte/motion', () => motion);
vi.mock('@xyflow/svelte', async () => ({
  BaseEdge: (await import('./test-support/PathEdge.svelte')).default,
  EdgeLabel: (await import('./test-support/PlainLabel.svelte')).default,
  getSmoothStepPath: () => ['M0 0L200 0', 100, 0],
  Position: { Left: 'left', Right: 'right' },
}));
const { default: DiscoveredEdge } = await import('./DiscoveredEdge.svelte');

beforeAll(() => {
  // jsdom has no SVG geometry; the edge measures its path to stop the dot before the arrowhead.
  (SVGElement.prototype as unknown as { getTotalLength: () => number }).getTotalLength = () => 200;
});
afterEach(() => {
  cleanup();
  motion.prefersReducedMotion.current = false;
});

function edge(data: Record<string, unknown>) {
  const { container } = render(DiscoveredEdge, {
    props: {
      id: 'a->b',
      source: 'a',
      target: 'b',
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 0,
      sourcePosition: 'right',
      targetPosition: 'left',
      data,
    } as never,
  });
  return container;
}

test('inferred relations are dashed', () => {
  expect(
    edge({ confidence: 'inferred' })
      .querySelector('path.relation')!
      .getAttribute('stroke-dasharray'),
  ).toBe('6 5');
  expect(
    edge({ confidence: 'observed' })
      .querySelector('path.relation')!
      .getAttribute('stroke-dasharray'),
  ).toBeNull();
});

test('a focused relation uses the accent arrowhead', () => {
  expect(
    edge({ confidence: 'observed', focused: true }).querySelector('path.relation.focused'),
  ).not.toBeNull();
});

test('the dot stops before the arrowhead', async () => {
  const container = edge({ confidence: 'observed', focused: true, animated: true });
  await Promise.resolve();
  const motionEl = container.querySelector('animateMotion');
  expect(motionEl).not.toBeNull();
  expect(motionEl!.getAttribute('keyPoints')).toBe('0.03;0.89');
});

test('under reduced motion a focused relation has no dot', () => {
  motion.prefersReducedMotion.current = true;
  expect(
    edge({ confidence: 'observed', focused: true, animated: true }).querySelector('animateMotion'),
  ).toBeNull();
});

test('a dimmed relation is marked', () => {
  expect(
    edge({ confidence: 'observed', dimmed: true }).querySelector('g.relation-group.dimmed'),
  ).not.toBeNull();
});

test('shows the wording as its label', () => {
  const container = edge({ confidence: 'observed', label: 'depends on', focusLabel: 'x' });
  expect(container.querySelector('.relation-label')!.textContent).toBe('depends on');
});

test('expands to the because label when focused', () => {
  const container = edge({
    confidence: 'inferred',
    focused: true,
    label: 'depends on',
    focusLabel: 'depends on · because depends on pg, a PostgreSQL client library',
  });
  expect(container.querySelector('.relation-label')!.textContent).toBe(
    'depends on · because depends on pg, a PostgreSQL client library',
  );
});

test('labels are text, never markup', () => {
  const container = edge({ confidence: 'observed', label: 'depends on <i>x</i>' });
  expect(container.querySelector('.relation-label i')).toBeNull();
  expect(container.querySelector('.relation-label')!.textContent).toBe('depends on <i>x</i>');
});
