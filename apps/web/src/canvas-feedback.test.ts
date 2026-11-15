import { expect, test } from 'vitest';
import { getCanvasFeedback } from './canvas-feedback.js';
import type { ProposedComponent } from './simulation.js';

const nodes: ProposedComponent[] = [
  { id: 'sandbox-1', label: 'App Server', kind: 'service', capacityRps: 50, baseLatencyMs: 5 },
];

test('high load creates explicit modeled bottleneck labels and evidence', () => {
  const result = getCanvasFeedback(nodes, [], 'sandbox-1', 80);
  expect(result[0]?.status).toBe('bottleneck');
  expect(result[0]?.label).toContain('30.0 dropped RPS');
  expect(result[0]?.detail).toContain('incoming 80 RPS');
  expect(result[0]?.detail).toContain('Review configured capacity');
});

test('modeled failure is distinguished from ordinary saturation', () => {
  const result = getCanvasFeedback([{ ...nodes[0]!, failed: true }], [], 'sandbox-1', 10);
  expect(result[0]?.status).toBe('failed');
  expect(result[0]?.label).toContain('FAILED');
});

test('near-capacity and idle are not mislabeled as bottlenecks', () => {
  expect(getCanvasFeedback(nodes, [], 'sandbox-1', 49)[0]?.status).toBe('near-capacity');
  expect(getCanvasFeedback(nodes, [], 'sandbox-1', 0)[0]?.status).toBe('normal');
  expect(getCanvasFeedback(nodes, [], 'sandbox-1', 0)[0]?.label).toContain('idle');
});

test('no proposed nodes yields no invented feedback', () => {
  expect(getCanvasFeedback([], [], 'sandbox-1', 100)).toEqual([]);
});
