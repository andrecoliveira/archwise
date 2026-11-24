import { expect, test } from 'vitest';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import { graphForView, initialView, showsNothingRecognized, systemGraph } from './system-view.js';

const api = discoveredNode('api', { type: 'service', label: 'api' });
const core = discoveredNode('core', { label: '@app/core' });
const db = discoveredNode('db', { label: '@app/db' });
const pg = discoveredNode('pg', { type: 'datastore', label: 'PostgreSQL', confidence: 'inferred' });
const demo = discoveredNode('demo', { type: 'service', outsideWorkspace: true });

test('hides modules and outside-workspace packages', () => {
  const view = systemGraph(graphOf([api, core, demo, pg], [discoveredEdge('demo', 'pg')]));
  expect(view.nodes.map((n) => n.id)).toEqual(['api', 'pg']);
  expect(view.edges).toEqual([]);
});

test('indirect relation keeps every step', () => {
  const first = discoveredEdge('api', 'db');
  const second = discoveredEdge('db', 'pg', {
    confidence: 'inferred',
    reasons: ['client-library:pg'],
    evidence: [
      { path: 'packages/db/package.json', kind: 'client-library', lines: null, analyzer: 'x' },
    ],
  });
  const view = systemGraph(graphOf([api, db, pg], [first, second]));
  expect(view.edges).toHaveLength(1);
  const edge = view.edges[0]!;
  expect(edge).toMatchObject({
    id: 'indirect:api->pg',
    type: 'depends-on',
    source: 'api',
    target: 'pg',
    confidence: 'inferred',
    reasons: [],
    origin: 'discovered',
  });
  expect(edge.indirect?.steps).toEqual([first, second]);
  expect(edge.indirect?.through).toEqual(['@app/db']);
  expect(edge.indirect?.others).toEqual([]);
  expect(edge.evidence).toEqual([...first.evidence, ...second.evidence]);
});

test('an all-observed chain stays observed', () => {
  const view = systemGraph(
    graphOf(
      [api, core, db, pg],
      [discoveredEdge('api', 'core'), discoveredEdge('core', 'db'), discoveredEdge('db', 'pg')],
    ),
  );
  expect(view.edges[0]).toMatchObject({ id: 'indirect:api->pg', confidence: 'observed' });
  expect(view.edges[0]!.indirect?.through).toEqual(['@app/core', '@app/db']);
});

test('prefers the chain with fewer inferred steps and lists the other', () => {
  const a = discoveredNode('a', { label: 'a' });
  const b = discoveredNode('b', { label: 'b' });
  const view = systemGraph(
    graphOf(
      [api, a, b, pg],
      [
        discoveredEdge('api', 'a'),
        discoveredEdge('a', 'pg'),
        discoveredEdge('api', 'b'),
        discoveredEdge('b', 'pg', { confidence: 'inferred' }),
      ],
    ),
  );
  expect(view.edges).toHaveLength(1);
  expect(view.edges[0]).toMatchObject({ confidence: 'observed' });
  expect(view.edges[0]!.indirect?.through).toEqual(['a']);
  expect(view.edges[0]!.indirect?.others).toEqual([['b']]);
});

test('prefers the shorter chain on equal inferred counts', () => {
  const view = systemGraph(
    graphOf(
      [api, core, db, pg],
      [
        discoveredEdge('api', 'core'),
        discoveredEdge('core', 'db'),
        discoveredEdge('db', 'pg'),
        discoveredEdge('core', 'pg'),
      ],
    ),
  );
  expect(view.edges[0]!.indirect?.through).toEqual(['@app/core']);
  expect(view.edges[0]!.indirect?.others).toEqual([['@app/core', '@app/db']]);
});

test('a direct relation wins over an indirect one', () => {
  const direct = discoveredEdge('api', 'pg', { confidence: 'inferred' });
  const view = systemGraph(
    graphOf([api, core, pg], [discoveredEdge('api', 'core'), discoveredEdge('core', 'pg'), direct]),
  );
  expect(view.edges).toEqual([direct]);
});

test('cycles among hidden libraries terminate', () => {
  const view = systemGraph(
    graphOf(
      [api, core, db, pg],
      [
        discoveredEdge('api', 'core'),
        discoveredEdge('core', 'db'),
        discoveredEdge('db', 'core'),
        discoveredEdge('db', 'pg'),
      ],
    ),
  );
  expect(view.edges.map((e) => e.id)).toEqual(['indirect:api->pg']);
});

test('others are capped at 20 chains per pair', () => {
  const libraries = Array.from({ length: 25 }, (_, i) =>
    discoveredNode(`lib${String(i).padStart(2, '0')}`),
  );
  const view = systemGraph(
    graphOf(
      [api, pg, ...libraries],
      libraries.flatMap((lib) => [discoveredEdge('api', lib.id), discoveredEdge(lib.id, 'pg')]),
    ),
  );
  expect(view.edges).toHaveLength(1);
  expect(view.edges[0]!.indirect?.others).toHaveLength(20);
});

test('visible nodes without edges stay visible', () => {
  expect(systemGraph(graphOf([api])).nodes).toEqual([api]);
});

test('initialView falls back to all when nothing is visible', () => {
  expect(initialView(graphOf([core, db]))).toBe('all');
  expect(initialView(graphOf([core, api]))).toBe('system');
});

test('graphForView all returns the graph unchanged', () => {
  const graph = graphOf([api, core], [discoveredEdge('api', 'core')]);
  expect(graphForView(graph, 'all')).toBe(graph);
  expect(graphForView(graph, 'system').nodes).toEqual([api]);
});

test('the nothing-recognized notice is for current scans only', () => {
  const librariesOnly = graphOf([core, db]);
  expect(showsNothingRecognized(librariesOnly, false)).toBe(true);
  // A resumed session's stored view predates the analyzers; the historical notice explains it.
  expect(showsNothingRecognized(librariesOnly, true)).toBe(false);
  expect(showsNothingRecognized(graphOf([api]), false)).toBe(false);
  expect(showsNothingRecognized(graphOf([]), false)).toBe(false);
});

test('the System view is computed once per graph', () => {
  const graph = graphOf(
    [api, core, pg],
    [discoveredEdge('api', 'core'), discoveredEdge('core', 'pg')],
  );
  expect(systemGraph(graph)).toBe(systemGraph(graph));
  expect(graphForView(graph, 'system')).toBe(systemGraph(graph));
});
