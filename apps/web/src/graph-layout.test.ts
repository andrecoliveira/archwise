import { expect, test } from 'vitest';
import type { Node } from '@xyflow/svelte';
import { layoutNodes } from './graph-layout.js';
import { NODE_SIZE } from './node-style.js';

const node = (id: string): Node => ({ id, position: { x: 0, y: 0 }, data: {} });

test('unconnected components keep at least the node spacing between them', async () => {
  const placed = await layoutNodes(
    [node('a'), node('b'), node('c')],
    [{ id: 'b-c', source: 'b', target: 'c' }],
  );
  const boxes = placed.map((n) => ({ x: n.position.x, y: n.position.y, w: 200, h: 72 }));
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(45);
    }
  }
});

test('pieces spacing uses the pieces size', async () => {
  const size = NODE_SIZE.pieces;
  const placed = await layoutNodes(
    [node('a'), node('b'), node('c')],
    [{ id: 'a-b', source: 'a', target: 'b' }],
    size,
  );
  const boxes = placed.map((n) => ({
    x: n.position.x,
    y: n.position.y,
    w: size.width,
    h: size.height,
  }));
  for (const [i, a] of boxes.entries()) {
    for (const b of boxes.slice(i + 1)) {
      const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
      const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
      expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(45);
    }
  }
});
