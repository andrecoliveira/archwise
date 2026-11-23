import { expect, test } from 'vitest';
import { runAnalyzers } from '@archwise/application';
import { demoAnalyzer } from '../src/index.js';

test('an analyzer outside the core runs through the public contract', () => {
  const result = runAnalyzers({
    analyzers: [demoAnalyzer],
    repositories: [
      {
        repository: { id: 'r', label: 'r' },
        files: [{ path: 'TODO.md', text: '- x', problem: null }],
        packages: [],
      },
    ],
  });
  expect(result.coverage).toEqual([
    { repositoryId: 'r', analyzerId: 'demo-todo', analyzerVersion: '0.1.0', status: 'complete' },
  ]);
  expect(result.facts.map((item) => item.fact)).toEqual([
    {
      type: 'resource',
      kind: 'external-system',
      technology: 'todo',
      label: 'TODO list',
      confidence: 'inferred',
      compose: null,
      evidence: [{ path: 'TODO.md', lines: null, ruleId: 'todo-file' }],
    },
  ]);
});
