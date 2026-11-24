import { expect, test } from 'vitest';
import {
  EXTERNAL_CATEGORIES,
  isFact,
  type AnalyzerInput,
  type Fact,
  type PackageFact,
} from '@archwise/application';
import { LIBRARY_CATALOG, ROLE_CATALOG, nodeRoles } from '../src/index.js';

const pkg = (
  path: string,
  dependencies: string[],
  devDependencies: string[] = [],
): PackageFact => ({
  path,
  directory: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
  name: path,
  dependencies,
  devDependencies,
  workspaces: null,
});

const run = (packages: PackageFact[]): readonly Fact[] => {
  const input: AnalyzerInput = {
    repository: { id: 'repo-root', label: 'shop' },
    files: [],
    packages,
    deadline: Number.MAX_SAFE_INTEGER,
    signal: new AbortController().signal,
    now: () => 0,
  };
  return nodeRoles.analyze(input).facts;
};

test('classifies frontend over service and records both signals', () => {
  const facts = run([pkg('apps/web/package.json', ['next', 'express'])]);
  expect(facts).toEqual([
    {
      type: 'package-role',
      package: 'apps/web/package.json',
      role: 'frontend',
      technology: 'next',
      confidence: 'inferred',
      reason: 'framework-dependency:next,express',
      evidence: [{ path: 'apps/web/package.json', lines: null, ruleId: 'framework-dependency' }],
    },
  ]);
});

test('a service role comes from a server framework, including dev dependencies', () => {
  const facts = run([pkg('apps/api/package.json', [], ['fastify'])]);
  expect(facts).toEqual([
    expect.objectContaining({ type: 'package-role', role: 'service', technology: 'fastify' }),
  ]);
});

test('client libraries become inferred resources from runtime dependencies only', () => {
  const facts = run([pkg('apps/api/package.json', ['pg', 'stripe'], ['mysql2'])]);
  const resources = facts.filter((fact) => fact.type === 'resource');
  const relations = facts.filter((fact) => fact.type === 'relation');
  expect(resources.map((fact) => [fact.kind, fact.technology, fact.label])).toEqual([
    ['datastore', 'postgresql', 'PostgreSQL'],
    ['external-system', 'stripe', 'Stripe'],
  ]);
  expect(relations.map((fact) => fact.reason)).toEqual([
    'client-library:pg',
    'client-library:stripe',
  ]);
  expect(relations[0]).toEqual({
    type: 'relation',
    kind: 'depends-on',
    from: { package: 'apps/api/package.json' },
    to: { resource: { kind: 'datastore', technology: 'postgresql' } },
    confidence: 'inferred',
    reason: 'client-library:pg',
    evidence: [{ path: 'apps/api/package.json', lines: null, ruleId: 'client-library' }],
  });
  expect(facts.every((fact) => !('confidence' in fact) || fact.confidence === 'inferred')).toBe(
    true,
  );
});

test('an ORM without a known engine targets unknown-sql', () => {
  const facts = run([pkg('packages/db/package.json', ['@prisma/client'])]);
  expect(facts).toContainEqual(
    expect.objectContaining({
      type: 'relation',
      to: { resource: { kind: 'datastore', technology: 'unknown-sql' } },
    }),
  );
});

test('one resource fact per technology even when several packages use it', () => {
  const facts = run([pkg('a/package.json', ['pg']), pkg('b/package.json', ['postgres'])]);
  expect(facts.filter((fact) => fact.type === 'resource')).toHaveLength(1);
  expect(facts.filter((fact) => fact.type === 'relation')).toHaveLength(2);
});

test('every emitted fact passes isFact', () => {
  const all = [
    ...ROLE_CATALOG.map((r) => r.dependency),
    ...LIBRARY_CATALOG.map((l) => l.dependency),
  ];
  const facts = run([pkg('package.json', all)]);
  expect(facts.length).toBeGreaterThan(LIBRARY_CATALOG.length);
  expect(facts.every(isFact)).toBe(true);
});

test('a package with no matches emits nothing', () => {
  expect(run([pkg('package.json', ['lodash'])])).toEqual([]);
});

test('every external catalog entry has a category', () => {
  const expected: Record<string, string> = {
    stripe: 'payments',
    sendgrid: 'email',
    resend: 'email',
    s3: 'storage',
    firebase: 'other',
    twilio: 'other',
    slack: 'other',
    sentry: 'monitoring',
    openai: 'ai',
    anthropic: 'ai',
  };
  for (const entry of LIBRARY_CATALOG) {
    if (entry.kind === 'external-system') {
      expect(EXTERNAL_CATEGORIES).toContain(entry.category);
      expect(entry.category).toBe(expected[entry.technology]);
    } else {
      expect(entry.category).toBeUndefined();
    }
  }
});
