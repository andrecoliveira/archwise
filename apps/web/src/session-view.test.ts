import { expect, test } from 'vitest';
import type { Graph } from './graph-types.js';
import { chooseWorkspaceGraph } from './session-view.js';

const current: Graph = { version: 1, nodes: [], edges: [], diagnostics: [], inspectedEntries: 0 };
const historical: Graph = {
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

test('an invalid stored view falls back to the current graph', () => {
  expect(chooseWorkspaceGraph({ baseIsCurrent: false, view: { nodes: 'x' } }, current)).toEqual({
    graph: current,
    historical: false,
  });
});
