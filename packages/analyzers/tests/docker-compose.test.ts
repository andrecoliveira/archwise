import { expect, test } from 'vitest';
import type { AnalyzerOutput, Fact, PackageFact } from '@archwise/application';
import { dockerCompose } from '../src/index.js';

const pkg = (directory: string): PackageFact => ({
  path: directory === '' ? 'package.json' : `${directory}/package.json`,
  directory,
  name: directory,
  dependencies: [],
  devDependencies: [],
  workspaces: null,
});

const run = (
  text: string,
  options: { path?: string; packages?: PackageFact[] } = {},
): AnalyzerOutput =>
  dockerCompose.analyze({
    repository: { id: 'repo-root', label: 'shop' },
    files: [{ path: options.path ?? 'compose.yaml', text }],
    packages: options.packages ?? [],
    deadline: Number.MAX_SAFE_INTEGER,
    signal: new AbortController().signal,
    now: () => 0,
  });

const ofType = <T extends Fact['type']>(output: AnalyzerOutput, type: T) =>
  output.facts.filter((fact): fact is Extract<Fact, { type: T }> => fact.type === type);

test('catalog images become observed resources', () => {
  const output = run(
    [
      'services:',
      '  db:',
      '    image: postgres:16',
      '  cache:',
      "    image: 'docker.io/library/redis:7@sha256:abc'",
      '  mq:',
      '    image: bitnami/kafka',
    ].join('\n'),
  );
  expect(
    ofType(output, 'resource').map((f) => [f.technology, f.compose?.service, f.confidence]),
  ).toEqual([
    ['postgresql', 'db', 'observed'],
    ['redis', 'cache', 'observed'],
    ['kafka', 'mq', 'observed'],
  ]);
  expect(ofType(output, 'resource')[0]).toEqual({
    type: 'resource',
    kind: 'datastore',
    technology: 'postgresql',
    label: 'PostgreSQL',
    confidence: 'observed',
    compose: { file: 'compose.yaml', service: 'db' },
    evidence: [{ path: 'compose.yaml', lines: { start: 2, end: 3 }, ruleId: 'compose-image' }],
  });
});

test('other images become generic compose services', () => {
  const output = run('services:\n  search:\n    image: ghcr.io/acme/search:1.2\n');
  expect(ofType(output, 'compose-service')).toEqual([
    {
      type: 'compose-service',
      file: 'compose.yaml',
      service: 'search',
      package: null,
      image: 'acme/search',
      evidence: [{ path: 'compose.yaml', lines: { start: 2, end: 3 }, ruleId: 'compose-service' }],
    },
  ]);
});

test('build contexts link packages', () => {
  const output = run(
    'services:\n  api:\n    build: ./apps/api\n  worker:\n    build:\n      context: apps/api\n',
    { packages: [pkg(''), pkg('apps/api')] },
  );
  expect(
    ofType(output, 'compose-service').map((f) => [f.service, f.package, f.evidence[0]!.ruleId]),
  ).toEqual([
    ['api', 'apps/api/package.json', 'compose-build'],
    ['worker', 'apps/api/package.json', 'compose-build'],
  ]);
});

test('a compose file in a subdirectory resolves contexts from its directory', () => {
  const output = run('services:\n  api:\n    build: ../apps/api\n', {
    path: 'deploy/compose.yaml',
    packages: [pkg('apps/api')],
  });
  expect(ofType(output, 'compose-service')[0]!.package).toBe('apps/api/package.json');
});

test('an unmatched build context is a gap', () => {
  const output = run('services:\n  x:\n    build: ./nowhere\n  y:\n    build: ../outside\n');
  expect(ofType(output, 'compose-service').map((f) => f.package)).toEqual([null, null]);
  expect(output.gaps).toEqual([{ path: 'compose.yaml', reason: 'unmatched-build-context' }]);
});

test('depends_on list and map forms', () => {
  const output = run(
    [
      'services:',
      '  db: { image: postgres }',
      '  api: { image: node, depends_on: [db, missing] }',
      '  worker:',
      '    image: node',
      '    depends_on:',
      '      db: { condition: service_healthy }',
    ].join('\n'),
  );
  expect(ofType(output, 'relation')).toEqual([
    {
      type: 'relation',
      kind: 'depends-on',
      from: { compose: { file: 'compose.yaml', service: 'api' } },
      to: { compose: { file: 'compose.yaml', service: 'db' } },
      confidence: 'observed',
      reason: 'compose-depends-on',
      evidence: [
        { path: 'compose.yaml', lines: { start: 3, end: 3 }, ruleId: 'compose-depends-on' },
      ],
    },
    expect.objectContaining({
      from: { compose: { file: 'compose.yaml', service: 'worker' } },
      to: { compose: { file: 'compose.yaml', service: 'db' } },
      evidence: [
        { path: 'compose.yaml', lines: { start: 6, end: 7 }, ruleId: 'compose-depends-on' },
      ],
    }),
  ]);
});

test('secrets never appear in facts', () => {
  const output = run(
    [
      'services:',
      '  api:',
      '    image: node',
      '    environment:',
      '      DATABASE_URL: postgres://u:hunter2@h/db',
      '    command: echo hunter2',
      '    env_file: .env',
      '    secrets: [db_password]',
    ].join('\n'),
  );
  const text = JSON.stringify(output);
  for (const forbidden of ['hunter2', 'DATABASE_URL', '.env', 'db_password']) {
    expect(text).not.toContain(forbidden);
  }
});

test('interpolation stays literal and a templated registry is stripped', () => {
  const output = run("services:\n  db:\n    image: '${REGISTRY}/postgres:16'\n");
  expect(ofType(output, 'resource').map((f) => f.technology)).toEqual(['postgresql']);
});

test('real-world anchors and merge keys parse', () => {
  const output = run('x-common: &c\n  image: redis:7\nservices:\n  cache:\n    <<: *c\n');
  expect(ofType(output, 'resource').map((f) => f.technology)).toEqual(['redis']);
});

test('an alias bomb is an invalid-syntax gap', () => {
  const lines = ['a: &a [x, x, x, x, x, x, x, x, x]'];
  const names = 'abcdefghi';
  for (let i = 1; i < names.length; i++) {
    lines.push(
      `${names[i]}: &${names[i]} [${Array(9)
        .fill(`*${names[i - 1]}`)
        .join(', ')}]`,
    );
  }
  lines.push('services: {}');
  const started = Date.now();
  const output = run(lines.join('\n'));
  expect(Date.now() - started).toBeLessThan(1000);
  expect(output.facts).toEqual([]);
  expect(output.gaps).toEqual([{ path: 'compose.yaml', reason: 'invalid-syntax' }]);
});

test('duplicate keys are invalid', () => {
  const output = run('services:\n  a: {image: redis}\n  a: {image: postgres}\n');
  expect(output.gaps).toEqual([{ path: 'compose.yaml', reason: 'invalid-syntax' }]);
  expect(output.facts).toEqual([]);
});

test('services that are not a mapping are invalid', () => {
  expect(run('services: [a, b]\n').gaps).toEqual([
    { path: 'compose.yaml', reason: 'invalid-syntax' },
  ]);
});

test('override files are unsupported', () => {
  const output = run('services:\n  db: { image: postgres }\n', {
    path: 'docker-compose.override.yml',
  });
  expect(output.gaps).toEqual([{ path: 'docker-compose.override.yml', reason: 'unsupported' }]);
  expect(output.facts).toEqual([]);
});

test('other Compose variants are unsupported, not silently skipped', () => {
  for (const path of ['compose.dev.yaml', 'deploy/docker-compose.prod.yml']) {
    const output = run('services:\n  db: { image: postgres }\n', { path });
    expect(output.gaps).toEqual([{ path, reason: 'unsupported' }]);
    expect(output.facts).toEqual([]);
  }
});

const PROPERTIES_FIXTURE = [
  'services:',
  '  api:',
  '    build: ./apps/api',
  '    ports:',
  '      - "127.0.0.1:8080:80/tcp"',
  '      - target: 9090',
  '        published: 9091',
  '    depends_on: [db]',
  '    environment:',
  '      DB_PASSWORD: s3cret',
  '    command: ["node", "x"]',
  '  db:',
  '    image: postgres:16',
].join('\n');

test('emits allowlisted properties with line evidence', () => {
  const output = run(PROPERTIES_FIXTURE, { packages: [pkg('apps/api')] });
  const properties = ofType(output, 'compose-property').map((fact) => [
    fact.compose.service,
    fact.name,
    fact.value,
    fact.evidence[0]?.lines,
    fact.evidence[0]?.ruleId,
  ]);
  expect(properties).toEqual([
    ['api', 'build', './apps/api', { start: 3, end: 3 }, 'compose-property'],
    ['api', 'ports', '8080:80, 9091:9090', { start: 4, end: 7 }, 'compose-property'],
    ['api', 'depends_on', 'db', { start: 8, end: 8 }, 'compose-property'],
    ['db', 'image', 'postgres:16', { start: 13, end: 13 }, 'compose-property'],
  ]);
  const text = JSON.stringify(output.facts);
  expect(text).not.toContain('s3cret');
  expect(text).not.toContain('"node"');
  expect(text).not.toContain('environment');
  const service = ofType(output, 'compose-service')[0]!;
  expect(service.evidence[0]?.lines).toEqual({ start: 2, end: 11 });
  const resource = ofType(output, 'resource')[0]!;
  expect(resource.evidence[0]?.lines).toEqual({ start: 12, end: 13 });
  const relation = ofType(output, 'relation')[0]!;
  expect(relation.evidence[0]?.lines).toEqual({ start: 8, end: 8 });
});

test('ports keep numbers only', () => {
  const output = run(
    [
      'services:',
      '  a:',
      '    image: x',
      '    ports: ["3000", "${PORT}:80"]',
      '  b:',
      '    image: y',
      '    ports:',
      '      - target: 80',
    ].join('\n'),
  );
  expect(
    ofType(output, 'compose-property')
      .filter((fact) => fact.name === 'ports')
      .map((fact) => fact.value),
  ).toEqual(['3000, 80', '80']);
});

test('image properties keep names that look like keys', () => {
  const output = run('services:\n  idp:\n    image: quay.io/keycloak/keycloak:21.1\n');
  expect(ofType(output, 'compose-property').map((fact) => fact.value)).toEqual([
    'quay.io/keycloak/keycloak:21.1',
  ]);
});
