import { expect, test } from 'vitest';
import { getCoachQuestions } from './architecture-coach.js';
import { discoveredEdge, discoveredNode, graphOf } from './graph-fixtures.js';
import type { Graph } from './graph-types.js';

const graph: Graph = graphOf([
  discoveredNode('package:apps/api/package.json', {
    label: '@demo/api',
    technology: 'fastify',
    evidence: [
      {
        path: 'apps/api/package.json',
        kind: 'package-manifest',
        lines: null,
        analyzer: 'node-manifest',
      },
    ],
  }),
]);

test('asks for business requirements before drawing conclusions from manifests', () => {
  const questions = getCoachQuestions(graph, null);
  expect(questions[0]?.topic).toBe('requirements');
  expect(questions.every((item) => !item.question.includes('Redis is installed'))).toBe(true);
});

test('provides source-backed questions for a selected package', () => {
  const selected = getCoachQuestions(graph, graph.nodes[0]!.id);
  const question = selected.find((item) => item.id === 'selected-responsibility');
  expect(question?.nodeId).toBe(graph.nodes[0]!.id);
  expect(question?.explanation).toContain('apps/api/package.json');
});

test('does not invent deployments when there is no evidence', () => {
  const questions = getCoachQuestions({ ...graph, nodes: [], edges: [] }, null);
  expect(questions).toHaveLength(1);
  expect(questions[0]?.id).toBe('requirements');
});

test('flags unresolved evidence and distinguishes code dependencies from runtime calls', () => {
  const withGaps: Graph = {
    ...graph,
    diagnostics: ['Invalid manifest'],
    edges: [discoveredEdge(graph.nodes[0]!.id, 'package:apps/web/package.json', { id: 'dep' })],
  };
  const questions = getCoachQuestions(withGaps, null);
  expect(questions.map((item) => item.id)).toContain('coverage');
  expect(questions.map((item) => item.id)).toContain('declared-vs-runtime');
});
