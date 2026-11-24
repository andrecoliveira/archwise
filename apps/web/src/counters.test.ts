import { expect, test } from 'vitest';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import type { GraphNode } from './graph-types.js';
import { counterLabels, countersFor, hiddenLibraries } from './counters.js';
import { scanNotes } from './scan-notes.js';

const nodes = (count: number, inferred: number): GraphNode[] =>
  Array.from({ length: count }, (_, i) =>
    discoveredNode(`n${i}`, {
      type: 'service',
      confidence: i < inferred ? 'inferred' : 'observed',
    }),
  );

test('labels state units and the confidence split', () => {
  const list = nodes(7, 3);
  const edges = Array.from({ length: 8 }, (_, i) =>
    discoveredEdge(`n${i % 7}`, `n${(i + 1) % 7}`, {
      id: `e${i}`,
      confidence: i < 5 ? 'inferred' : 'observed',
    }),
  );
  const graph = graphOf(list, edges, {
    gaps: [{ path: 'compose.prod.yaml', analyzer: 'docker-compose', reason: 'unsupported' }],
    diagnostics: ['a', 'b'],
  });
  const counters = countersFor(graph, scanNotes(graph));
  expect(counters).toEqual({
    components: { total: 7, inferred: 3 },
    relations: { total: 8, inferred: 5 },
    files: 1,
    notes: 2,
  });
  expect(counterLabels(counters)).toEqual({
    components: '7 components · 3 inferred',
    relations: '8 relations · 5 inferred',
    scan: '1 file not analyzed · 2 notes',
  });
});

test('"0 inferred" is omitted and singular forms apply', () => {
  const graph = graphOf(nodes(1, 0), [discoveredEdge('n0', 'n0', { id: 'self' })]);
  expect(counterLabels(countersFor(graph, scanNotes(graph)))).toEqual({
    components: '1 component',
    relations: '1 relation',
    scan: null,
  });
});

test('hiddenLibraries lists the modules the system view hides', () => {
  const graph = graphOf([
    discoveredNode('b', { label: 'zeta' }),
    discoveredNode('a', { label: 'alpha' }),
    discoveredNode('s', { type: 'service' }),
  ]);
  expect(hiddenLibraries(graph).map((node) => node.label)).toEqual(['alpha', 'zeta']);
});
