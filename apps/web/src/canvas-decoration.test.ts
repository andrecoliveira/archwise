import { expect, test } from 'vitest';
import type { Edge, Node } from '@xyflow/svelte';
import { CANVAS_A11Y, decorate } from './canvas-decoration.js';

const node = (id: string, type = 'iso'): Node => ({ id, type, position: { x: 0, y: 0 }, data: {} });
const edge = (source: string, target: string): Edge => ({
  id: `${source}->${target}`,
  source,
  target,
  data: { origin: 'discovered' },
});
const NODES = [node('web'), node('api'), node('db'), node('worker')];
const EDGES = [edge('web', 'api'), edge('api', 'db')];

test('the selected component is the one Svelte Flow marks selected', () => {
  const { nodes } = decorate(NODES, EDGES, { selected: 'api', focus: true });
  expect(nodes.filter((n) => n.selected).map((n) => n.id)).toEqual(['api']);
});

test('no selection means nothing selected, dimmed or still', () => {
  const { nodes } = decorate(NODES, EDGES, { selected: null, focus: true });
  expect(nodes.some((n) => n.selected || n.data.dimmed)).toBe(false);
  expect(nodes.every((n) => n.data.animated === true)).toBe(true);
});

test('focus dims what is not connected to the selection', () => {
  const { nodes, edges } = decorate(NODES, EDGES, { selected: 'api', focus: true });
  expect(nodes.filter((n) => n.data.dimmed).map((n) => n.id)).toEqual(['worker']);
  expect(edges.every((e) => e.data!.focused === true)).toBe(true);
});

test('a selection that is not on the canvas dims nothing', () => {
  const { nodes } = decorate([node('worker')], [], { selected: 'web', focus: true });
  expect(nodes[0]!.data.dimmed).toBe(false);
  expect(nodes[0]!.data.animated).toBe(true);
  expect(nodes[0]!.selected).toBe(false);
});

test('without focus (Sandbox) the selection is marked but nothing dims', () => {
  const { nodes } = decorate(NODES, EDGES, { selected: 'api', focus: false });
  expect(nodes.find((n) => n.id === 'api')!.selected).toBe(true);
  expect(nodes.some((n) => n.data.dimmed)).toBe(false);
});

test('screen-reader help describes this canvas, not node moving or deleting', () => {
  const text = CANVAS_A11Y['node.a11yDescription.default'];
  expect(text).not.toMatch(/arrow keys to move|delete/i);
  expect(text).toMatch(/Enter/);
});
