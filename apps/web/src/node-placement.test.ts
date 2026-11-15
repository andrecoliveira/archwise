import { expect, test } from 'vitest';
import { suggestedNodePosition } from './node-placement.js';

test('desktop presets leave enough room for card bodies and connection handles', () => {
  const nodes = Array.from({ length: 3 }, (_, index) => suggestedNodePosition(index, 1440));
  expect(nodes.map((item) => item.x)).toEqual([80, 380, 680]);
  for (let i = 1; i < nodes.length; i++) {
    expect(nodes[i]!.x - nodes[i - 1]!.x).toBeGreaterThanOrEqual(280);
  }
});

test('narrow viewports use rows instead of letting cards overlap horizontally', () => {
  const nodes = Array.from({ length: 4 }, (_, index) => suggestedNodePosition(index, 900));
  expect(nodes).toEqual([
    { x: 80, y: 130 },
    { x: 380, y: 130 },
    { x: 80, y: 305 },
    { x: 380, y: 305 },
  ]);
});

test('defensively clamps negative indices', () => {
  expect(suggestedNodePosition(-3, 1440)).toEqual(suggestedNodePosition(0, 1440));
});
