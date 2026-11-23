import { expect, test } from 'vitest';
import type { AnalyzerOutput, PackageFact } from '@archwise/application';
import { prismaSchema } from '../src/index.js';

const pkg = (directory: string): PackageFact => ({
  path: directory === '' ? 'package.json' : `${directory}/package.json`,
  directory,
  name: directory,
  dependencies: [],
  devDependencies: [],
  workspaces: null,
});

const run = (
  path: string,
  text: string,
  packages = [pkg(''), pkg('packages/db')],
): AnalyzerOutput =>
  prismaSchema.analyze({
    repository: { id: 'repo-root', label: 'shop' },
    files: [{ path, text }],
    packages,
    deadline: Number.MAX_SAFE_INTEGER,
    signal: new AbortController().signal,
    now: () => 0,
  });

test('reads the provider literal with its line', () => {
  const output = run(
    'packages/db/prisma/schema.prisma',
    '// comment\ndatasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}\n',
  );
  expect(output.facts).toEqual([
    {
      type: 'datastore-technology',
      package: 'packages/db/package.json',
      technology: 'postgresql',
      label: 'PostgreSQL',
      evidence: [
        {
          path: 'packages/db/prisma/schema.prisma',
          lines: { start: 3, end: 3 },
          ruleId: 'prisma-datasource',
        },
      ],
    },
  ]);
  expect(JSON.stringify(output)).not.toContain('DATABASE_URL');
});

test('the owner is the nearest enclosing package, the root included', () => {
  const output = run('prisma/schema.prisma', 'datasource db {\n  provider = "mysql"\n}\n');
  expect(output.facts).toEqual([
    expect.objectContaining({ package: 'package.json', technology: 'mysql', label: 'MySQL' }),
  ]);
});

test('a commented-out provider is ignored', () => {
  const output = run(
    'packages/db/schema.prisma',
    'datasource db {\n  // provider = "mysql"\n  provider = "sqlite"\n}\n',
  );
  expect(
    output.facts.map((fact) => (fact.type === 'datastore-technology' ? fact.technology : '')),
  ).toEqual(['sqlite']);
});

test('an env provider is unsupported', () => {
  const output = run('packages/db/schema.prisma', 'datasource db {\n  provider = env("P")\n}\n');
  expect(output.facts).toEqual([]);
  expect(output.gaps).toEqual([{ path: 'packages/db/schema.prisma', reason: 'unsupported' }]);
});

test('a schema without a datasource is unsupported', () => {
  expect(run('packages/db/schema.prisma', 'model User { id Int @id }\n').gaps).toEqual([
    { path: 'packages/db/schema.prisma', reason: 'unsupported' },
  ]);
});

test('a schema without an owning package emits nothing', () => {
  expect(run('x/schema.prisma', 'datasource db {\n  provider = "mysql"\n}\n', []).facts).toEqual(
    [],
  );
});

test('hostile comment runs are scanned in linear time', () => {
  const hostile = `datasource db {\n  provider = "mysql"\n}\n${'//'.repeat(100_000)}x\n${' '.repeat(100_000)}provider${' '.repeat(100_000)}=\n`;
  const started = performance.now();
  expect(run('packages/db/schema.prisma', hostile).facts).toHaveLength(1);
  expect(performance.now() - started).toBeLessThan(200);
});
