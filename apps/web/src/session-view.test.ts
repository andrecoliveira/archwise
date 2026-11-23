import { expect, test } from 'vitest';
import { discoveredNode, graphOf } from './graph-fixtures.js';
import { chooseWorkspaceGraph } from './session-view.js';

const current = graphOf([]);
const historical = graphOf([discoveredNode('package:package.json', { label: 'old' })]);
const storedV1 = {
  version: 1,
  nodes: [
    {
      id: 'package:package.json',
      type: 'package',
      label: 'old',
      framework: null,
      origin: 'discovered',
      evidence: [{ path: 'package.json', kind: 'package-manifest' }],
    },
  ],
  edges: [],
  diagnostics: [],
  inspectedEntries: 1,
};

test('without a session the current graph is shown', () => {
  expect(chooseWorkspaceGraph(null, current)).toEqual({ graph: current, historical: false });
});

test('a session on the current base shows the current graph', () => {
  expect(chooseWorkspaceGraph({ baseIsCurrent: true, view: historical }, current)).toEqual({
    graph: current,
    historical: false,
  });
});

test('a session on an older base shows its stored view', () => {
  expect(chooseWorkspaceGraph({ baseIsCurrent: false, view: historical }, current)).toEqual({
    graph: historical,
    historical: true,
  });
});

test('a stored v1 view is shown historically after upgrade', () => {
  const chosen = chooseWorkspaceGraph({ baseIsCurrent: false, view: storedV1 }, current);
  expect(chosen.historical).toBe(true);
  expect(chosen.graph.nodes.map((n) => [n.id, n.type])).toEqual([
    ['package:package.json', 'module'],
  ]);
});

test('an invalid stored view falls back to the current graph', () => {
  expect(chooseWorkspaceGraph({ baseIsCurrent: false, view: { nodes: 'x' } }, current)).toEqual({
    graph: current,
    historical: false,
  });
});
