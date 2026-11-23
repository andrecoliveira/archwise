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

test('lifts through a library chain once', () => {
  const view = systemGraph(
    graphOf(
      [api, core, db, pg],
      [
        discoveredEdge('api', 'core'),
        discoveredEdge('core', 'db'),
        discoveredEdge('db', 'pg', { confidence: 'inferred', reasons: ['client-library:pg'] }),
      ],
    ),
  );
  expect(view.edges).toEqual([
    {
      id: 'lifted:api->pg',
      type: 'depends-on',
      source: 'api',
      target: 'pg',
      confidence: 'inferred',
      reasons: ['via @app/core, @app/db'],
      origin: 'discovered',
      evidence: discoveredEdge('db', 'pg').evidence,
    },
  ]);
});

test('does not duplicate a direct edge', () => {
  const direct = discoveredEdge('api', 'pg', { confidence: 'inferred' });
  const view = systemGraph(
    graphOf([api, core, pg], [discoveredEdge('api', 'core'), discoveredEdge('core', 'pg'), direct]),
  );
  expect(view.edges).toEqual([direct]);
});

test('cycles through hidden modules terminate', () => {
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
  expect(view.edges.map((e) => e.id)).toEqual(['lifted:api->pg']);
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
