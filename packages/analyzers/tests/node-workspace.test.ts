import { expect, test } from 'vitest';
import type { AnalyzerInput, AnalyzerOutput, PackageFact } from '@archwise/application';
import { nodeWorkspace } from '../src/index.js';

const pkg = (path: string, workspaces: string[] | null = null): PackageFact => ({
  path,
  directory: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  name: path,
  dependencies: [],
  devDependencies: [],
  workspaces,
});

const run = (
  packages: PackageFact[],
  files: { path: string; text: string }[] = [],
): AnalyzerOutput =>
  nodeWorkspace.analyze({
    repository: { id: 'repo-root', label: 'shop' },
    files,
    packages,
    deadline: Number.MAX_SAFE_INTEGER,
    signal: new AbortController().signal,
    now: () => 0,
  } satisfies AnalyzerInput);

const monorepo = [
  pkg('package.json'),
  pkg('apps/web/package.json'),
  pkg('packages/db/package.json'),
  pkg('examples/demo/package.json'),
];

test('flags packages outside pnpm workspace globs', () => {
  const output = run(monorepo, [
    { path: 'pnpm-workspace.yaml', text: "packages:\n  - 'apps/*'\n  - 'packages/*'\n" },
  ]);
  expect(output.facts).toEqual([
    {
      type: 'outside-workspace',
      package: 'examples/demo/package.json',
      evidence: [{ path: 'examples/demo/package.json', lines: null, ruleId: 'outside-workspace' }],
    },
  ]);
  expect(output.gaps).toEqual([]);
});

test('reads package.json workspaces', () => {
  const output = run([
    pkg('package.json', ['apps/*']),
    pkg('apps/web/package.json'),
    pkg('packages/db/package.json'),
  ]);
  expect(
    output.facts.map((fact) => (fact.type === 'outside-workspace' ? fact.package : '')),
  ).toEqual(['packages/db/package.json']);
});

test('a nested pnpm-workspace.yaml is not the repository declaration', () => {
  const output = run(monorepo, [
    { path: 'examples/pnpm-workspace.yaml', text: "packages: ['x/*']\n" },
  ]);
  expect(output.facts).toEqual([]);
});

test('no declarations means everyone is a member', () => {
  expect(run(monorepo).facts).toEqual([]);
});

test('nx files are unsupported gaps', () => {
  const output = run(monorepo, [
    { path: 'nx.json', text: '{}' },
    { path: 'apps/web/project.json', text: '{}' },
  ]);
  expect(output.gaps).toEqual([
    { path: 'apps/web/project.json', reason: 'unsupported' },
    { path: 'nx.json', reason: 'unsupported' },
  ]);
});

test('invalid pnpm-workspace.yaml is an invalid-syntax gap and is ignored', () => {
  const output = run(monorepo, [{ path: 'pnpm-workspace.yaml', text: 'packages: [' }]);
  expect(output.gaps).toEqual([{ path: 'pnpm-workspace.yaml', reason: 'invalid-syntax' }]);
  expect(output.facts).toEqual([]);
});
