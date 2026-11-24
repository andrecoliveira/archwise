import { expect, test } from 'vitest';
import {
  isFact,
  matchesInputName,
  runAnalyzers,
  type Analyzer,
  type AnalyzerDescriptor,
  type AnalyzerInput,
  type AnalysisRepositoryInput,
  type Fact,
} from '../src/index.js';

const descriptor = (overrides: Partial<AnalyzerDescriptor> = {}): AnalyzerDescriptor => ({
  id: 'test-analyzer',
  version: '1.0.0',
  inputs: { fileNames: [], extensions: [] },
  budget: { timeMs: 1000, maxFiles: 100 },
  ...overrides,
});

const fact = (technology: string): Fact => ({
  type: 'resource',
  kind: 'datastore',
  technology,
  label: technology,
  confidence: 'inferred',
  compose: null,
  evidence: [{ path: 'package.json', lines: null, ruleId: 'test' }],
});

const repo = (
  id: string,
  files: AnalysisRepositoryInput['files'] = [],
): AnalysisRepositoryInput => ({ repository: { id, label: id }, files, packages: [] });

const analyzer = (
  analyze: (input: AnalyzerInput) => unknown,
  overrides: Partial<AnalyzerDescriptor> = {},
): Analyzer => ({
  descriptor: descriptor(overrides),
  analyze: analyze as Analyzer['analyze'],
});

test('routes files by name and extension and passes repository-relative text', () => {
  let seen: string[] = [];
  const subject = analyzer(
    (input) => {
      seen = input.files.map((file) => file.path);
      return { status: 'complete', facts: [], gaps: [] };
    },
    { inputs: { fileNames: ['compose.yaml'], extensions: ['.prisma'] } },
  );
  runAnalyzers({
    analyzers: [subject],
    repositories: [
      repo('repo-a', [
        { path: 'compose.yaml', text: 'services: {}', problem: null },
        { path: 'db/schema.prisma', text: 'x', problem: null },
        { path: 'x.ts', text: 'x', problem: null },
      ]),
    ],
  });
  expect(seen).toEqual(['compose.yaml', 'db/schema.prisma']);
});

test('a throwing analyzer fails only its own repository', () => {
  const flaky = analyzer(
    (input) => {
      if (input.repository.id === 'repo-b') throw new Error('boom');
      return { status: 'complete', facts: [fact('pg')], gaps: [] };
    },
    { id: 'a-flaky' },
  );
  const healthy = analyzer(() => ({ status: 'complete', facts: [fact('redis')], gaps: [] }), {
    id: 'b-healthy',
  });
  const result = runAnalyzers({
    analyzers: [healthy, flaky],
    repositories: [repo('repo-a'), repo('repo-b')],
  });
  expect(result.coverage.filter((row) => row.analyzerId === 'a-flaky')).toEqual([
    { repositoryId: 'repo-a', analyzerId: 'a-flaky', analyzerVersion: '1.0.0', status: 'complete' },
    { repositoryId: 'repo-b', analyzerId: 'a-flaky', analyzerVersion: '1.0.0', status: 'failed' },
  ]);
  expect(result.failures).toEqual([{ repositoryId: 'repo-b', analyzerId: 'a-flaky' }]);
  expect(result.facts.filter((f) => f.analyzerId === 'a-flaky').map((f) => f.repositoryId)).toEqual(
    ['repo-a'],
  );
  expect(
    result.facts.filter((f) => f.analyzerId === 'b-healthy').map((f) => f.repositoryId),
  ).toEqual(['repo-a', 'repo-b']);
});

test('an invalid fact fails the analyzer', () => {
  const result = runAnalyzers({
    analyzers: [
      analyzer(() => ({
        status: 'complete',
        facts: [fact('pg'), { type: 'resource', kind: 'cache' }],
        gaps: [],
      })),
    ],
    repositories: [repo('repo-a')],
  });
  expect(result.coverage[0]!.status).toBe('failed');
  expect(result.facts).toEqual([]);
});

test('a non-object output fails the analyzer', () => {
  const result = runAnalyzers({
    analyzers: [analyzer(() => null)],
    repositories: [repo('repo-a')],
  });
  expect(result.coverage[0]!.status).toBe('failed');
});

test('finishing after the deadline fails the analyzer', () => {
  let clock = 0;
  const result = runAnalyzers({
    analyzers: [
      analyzer(() => {
        clock += 1001;
        return { status: 'complete', facts: [fact('pg')], gaps: [] };
      }),
    ],
    repositories: [repo('repo-a')],
    now: () => clock,
  });
  expect(result.coverage[0]!.status).toBe('failed');
  expect(result.facts).toEqual([]);
});

test('partial status is kept', () => {
  const result = runAnalyzers({
    analyzers: [analyzer(() => ({ status: 'partial', facts: [], gaps: [] }))],
    repositories: [repo('repo-a')],
  });
  expect(result.coverage[0]!.status).toBe('partial');
});

test('problem files become gaps', () => {
  let received = -1;
  const result = runAnalyzers({
    analyzers: [
      analyzer(
        (input) => {
          received = input.files.length;
          return { status: 'complete', facts: [], gaps: [] };
        },
        { inputs: { fileNames: ['compose.yaml'], extensions: [] } },
      ),
    ],
    repositories: [repo('repo-a', [{ path: 'compose.yaml', text: null, problem: 'too-large' }])],
  });
  expect(received).toBe(0);
  expect(result.gaps).toEqual([
    {
      repositoryId: 'repo-a',
      analyzerId: 'test-analyzer',
      path: 'compose.yaml',
      reason: 'too-large',
    },
  ]);
});

test('maxFiles overflow becomes budget gaps', () => {
  let received: string[] = [];
  const result = runAnalyzers({
    analyzers: [
      analyzer(
        (input) => {
          received = input.files.map((file) => file.path);
          return { status: 'complete', facts: [], gaps: [] };
        },
        {
          inputs: { fileNames: [], extensions: ['.prisma'] },
          budget: { timeMs: 1000, maxFiles: 1 },
        },
      ),
    ],
    repositories: [
      repo('repo-a', [
        { path: 'b.prisma', text: 'x', problem: null },
        { path: 'a.prisma', text: 'x', problem: null },
      ]),
    ],
  });
  expect(received).toEqual(['a.prisma']);
  expect(result.gaps.map((gap) => [gap.path, gap.reason])).toEqual([['b.prisma', 'budget']]);
  expect(result.coverage[0]!.status).toBe('partial');
});

test("an analyzer's own gaps are kept", () => {
  const result = runAnalyzers({
    analyzers: [
      analyzer(() => ({
        status: 'complete',
        facts: [],
        gaps: [{ path: 'nx.json', reason: 'unsupported' }],
      })),
    ],
    repositories: [repo('repo-a')],
  });
  expect(result.gaps).toEqual([
    { repositoryId: 'repo-a', analyzerId: 'test-analyzer', path: 'nx.json', reason: 'unsupported' },
  ]);
});

test('abort rethrows', () => {
  const controller = new AbortController();
  controller.abort();
  expect(() =>
    runAnalyzers({
      analyzers: [analyzer(() => ({ status: 'complete', facts: [], gaps: [] }))],
      repositories: [repo('repo-a')],
      signal: controller.signal,
    }),
  ).toThrow(expect.objectContaining({ name: 'AbortError' }));
});

test('version is carried', () => {
  const result = runAnalyzers({
    analyzers: [
      analyzer(() => ({ status: 'complete', facts: [fact('pg')], gaps: [] }), {
        version: '2.0.0',
      }),
    ],
    repositories: [repo('repo-a')],
  });
  expect(result.coverage[0]!.analyzerVersion).toBe('2.0.0');
  expect(result.facts[0]!.analyzerVersion).toBe('2.0.0');
});

test('isFact rejects unknown keys', () => {
  const relation: Fact = {
    type: 'relation',
    kind: 'depends-on',
    from: { package: 'package.json' },
    to: { resource: { kind: 'datastore', technology: 'postgresql' } },
    confidence: 'inferred',
    reason: 'client-library:pg',
    evidence: [{ path: 'package.json', lines: { start: 1, end: 2 }, ruleId: 'client-library' }],
  };
  expect(isFact(relation)).toBe(true);
  expect(isFact({ ...relation, extra: 1 })).toBe(false);
  expect(
    isFact({ ...relation, evidence: [{ path: 'a', lines: { start: 3, end: 2 }, ruleId: 'r' }] }),
  ).toBe(false);
  expect(isFact({ ...relation, to: { compose: { file: 'compose.yaml', service: 'db' } } })).toBe(
    true,
  );
});

test('a file name with one wildcard routes matching names only', () => {
  expect(matchesInputName('compose.prod.yaml', 'compose.*.yaml')).toBe(true);
  expect(matchesInputName('compose.yaml', 'compose.*.yaml')).toBe(false);
  expect(matchesInputName('docker-compose.yaml', 'compose.*.yaml')).toBe(false);
  expect(matchesInputName('compose.yaml', 'compose.yaml')).toBe(true);
  let seen: string[] = [];
  runAnalyzers({
    analyzers: [
      analyzer(
        (input) => {
          seen = input.files.map((file) => file.path);
          return { status: 'complete', facts: [], gaps: [] };
        },
        { inputs: { fileNames: ['compose.*.yaml'], extensions: [] } },
      ),
    ],
    repositories: [
      repo('repo-a', [
        { path: 'compose.yaml', text: 'x', problem: null },
        { path: 'deploy/compose.dev.yaml', text: 'x', problem: null },
      ]),
    ],
  });
  expect(seen).toEqual(['deploy/compose.dev.yaml']);
});

test('isFact accepts an optional external category only on external resources', () => {
  const resource = {
    type: 'resource',
    kind: 'external-system',
    technology: 'stripe',
    label: 'Stripe',
    confidence: 'inferred',
    compose: null,
    evidence: [{ path: 'package.json', lines: null, ruleId: 'client-library' }],
  };
  expect(isFact(resource)).toBe(true);
  expect(isFact({ ...resource, category: 'payments' })).toBe(true);
  expect(isFact({ ...resource, category: 'banking' })).toBe(false);
  expect(isFact({ ...resource, kind: 'datastore', category: 'payments' })).toBe(false);
});

test('isFact accepts compose-property facts with an allowlisted name only', () => {
  const property = {
    type: 'compose-property',
    compose: { file: 'compose.yaml', service: 'api' },
    name: 'ports',
    value: '8080:80',
    evidence: [{ path: 'compose.yaml', lines: { start: 4, end: 5 }, ruleId: 'compose-property' }],
  };
  expect(isFact(property)).toBe(true);
  expect(isFact({ ...property, name: 'environment' })).toBe(false);
  expect(isFact({ ...property, value: 1 })).toBe(false);
});
