import { expect, test } from 'vitest';
import { getCoachQuestions } from './architecture-coach.js';
import type { Graph } from './graph-types.js';

const graph: Graph = {
  version: 1,
  nodes: [
    {
      id: 'package:apps/api/package.json',
      type: 'package',
      label: '@demo/api',
      framework: 'fastify',
      origin: 'discovered',
      evidence: [{ path: 'apps/api/package.json', kind: 'package-manifest' }],
    },
  ],
  edges: [],
  diagnostics: [],
  inspectedEntries: 1,
};

test('asks for business requirements before drawing conclusions from manifests', () => {
  const questions = getCoachQuestions(graph, null);
  expect(questions[0]?.topic).toBe('requirements');
  expect(questions.every((item) => !item.question.includes('Redis is installed'))).toBe(true);
});

test('provides source-backed questions for a selected package', () => {
  const selected = getCoachQuestions(graph, graph.nodes[0]!.id);
  expect(selected.find((item) => item.id === 'selected-responsibility')).toEqual(
    expect.objectContaining({
      nodeId: graph.nodes[0]!.id,
      explanation: expect.stringContaining('apps/api/package.json'),
    }),
  );
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
    edges: [
      {
        id: 'dep',
        source: graph.nodes[0]!.id,
        target: 'package:apps/web/package.json',
        type: 'declared-dependency',
        origin: 'discovered',
        evidence: [{ path: 'apps/api/package.json', kind: 'package-dependency' }],
      },
    ],
  };
  const questions = getCoachQuestions(withGaps, null);
  expect(questions.map((item) => item.id)).toContain('coverage');
  expect(questions.map((item) => item.id)).toContain('declared-vs-runtime');
});
