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

const judged = (id: string, confidence: string): Node => ({
  ...node(id),
  data: { node: { id, confidence } },
});
const relation = (source: string, target: string, confidence: string): Edge => ({
  ...edge(source, target),
  data: { origin: 'discovered', confidence },
});
const FILTER_NODES = [judged('web', 'observed'), judged('queue', 'inferred')];
const FILTER_EDGES = [relation('web', 'queue', 'inferred'), relation('queue', 'web', 'observed')];

test('inferred-components filter dims observed nodes and all edges', () => {
  const { nodes, edges } = decorate(FILTER_NODES, FILTER_EDGES, {
    selected: null,
    focus: true,
    filter: 'inferred-components',
  });
  expect(nodes.filter((n) => n.data.dimmed).map((n) => n.id)).toEqual(['web']);
  expect(edges.every((e) => e.data!.dimmed === true)).toBe(true);
});

test('inferred-relations filter dims observed edges and no nodes', () => {
  const { nodes, edges } = decorate(FILTER_NODES, FILTER_EDGES, {
    selected: null,
    focus: true,
    filter: 'inferred-relations',
  });
  expect(nodes.some((n) => n.data.dimmed)).toBe(false);
  expect(edges.filter((e) => e.data!.dimmed).map((e) => e.id)).toEqual(['queue->web']);
});

test('filter adds no colour: only dimming changes', () => {
  const plain = decorate(FILTER_NODES, FILTER_EDGES, { selected: null, focus: true });
  const filtered = decorate(FILTER_NODES, FILTER_EDGES, {
    selected: null,
    focus: true,
    filter: 'inferred-components',
  });
  const strip = (data: Record<string, unknown>) => ({ ...data, dimmed: undefined });
  expect(filtered.nodes.map((n) => strip(n.data))).toEqual(plain.nodes.map((n) => strip(n.data)));
  expect(filtered.edges.map((e) => strip(e.data!))).toEqual(plain.edges.map((e) => strip(e.data!)));
});

test('a selection focus wins over a filter', () => {
  const { nodes } = decorate(FILTER_NODES, FILTER_EDGES, {
    selected: 'web',
    focus: true,
    filter: 'inferred-components',
  });
  expect(nodes.some((n) => n.data.dimmed)).toBe(false);
});
