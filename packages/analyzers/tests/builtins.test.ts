import { expect, test } from 'vitest';
import { analyzerInputs } from '@archwise/application';
import { BUILTIN_ANALYZERS } from '../src/index.js';

test('BUILTIN_ANALYZERS are sorted, unique and versioned semver', () => {
  const ids = BUILTIN_ANALYZERS.map((analyzer) => analyzer.descriptor.id);
  expect(ids).toEqual(['docker-compose', 'node-roles', 'node-workspace', 'prisma-schema']);
  for (const analyzer of BUILTIN_ANALYZERS) {
    expect(analyzer.descriptor.version).toMatch(/^\d+\.\d+\.\d+$/);
  }
});

test('the built-in inputs are the exact sorted union', () => {
  expect(analyzerInputs(BUILTIN_ANALYZERS)).toEqual({
    fileNames: [
      'compose.override.yaml',
      'compose.override.yml',
      'compose.yaml',
      'compose.yml',
      'docker-compose.override.yaml',
      'docker-compose.override.yml',
      'docker-compose.yaml',
      'docker-compose.yml',
      'lerna.json',
      'nx.json',
      'pnpm-workspace.yaml',
      'project.json',
    ],
    extensions: ['.prisma'],
  });
});
