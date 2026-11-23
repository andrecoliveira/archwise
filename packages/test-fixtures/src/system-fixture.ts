/**
 * The documented Phase 4 fixture: a pnpm monorepo with a Next frontend, a Fastify API, a
 * BullMQ worker, a shared database package with Prisma, Compose infrastructure, a stray
 * example outside the workspace and a `.env` that must never be read.
 */
export const SYSTEM_FIXTURE: Readonly<Record<string, string>> = Object.freeze({
  'package.json': `${JSON.stringify({ name: 'shop', private: true }, null, 2)}\n`,
  'pnpm-workspace.yaml': "packages:\n  - 'apps/*'\n  - 'packages/*'\n",
  'apps/web/package.json': `${JSON.stringify(
    { name: '@shop/web', dependencies: { next: '15.0.0', 'react-dom': '19.0.0' } },
    null,
    2,
  )}\n`,
  'apps/api/package.json': `${JSON.stringify(
    {
      name: '@shop/api',
      dependencies: { fastify: '5.0.0', '@shop/db': 'workspace:*', stripe: '17.0.0' },
    },
    null,
    2,
  )}\n`,
  'apps/worker/package.json': `${JSON.stringify(
    { name: '@shop/worker', dependencies: { bullmq: '5.0.0', '@shop/db': 'workspace:*' } },
    null,
    2,
  )}\n`,
  'packages/db/package.json': `${JSON.stringify(
    { name: '@shop/db', dependencies: { '@prisma/client': '6.0.0', pg: '8.0.0' } },
    null,
    2,
  )}\n`,
  'packages/db/prisma/schema.prisma': [
    'datasource db {',
    '  provider = "postgresql"',
    '  url      = env("DATABASE_URL")',
    '}',
    '',
  ].join('\n'),
  'compose.yaml': [
    'services:',
    '  db:',
    '    image: postgres:16',
    '    environment:',
    '      POSTGRES_PASSWORD: example-only',
    '  cache:',
    '    image: redis:7',
    '  api:',
    '    build: ./apps/api',
    '    depends_on: [db, cache]',
    '  worker:',
    '    build: ./apps/worker',
    '    depends_on: [cache]',
    '',
  ].join('\n'),
  'examples/demo/package.json': `${JSON.stringify(
    { name: 'demo', dependencies: { express: '5.0.0' } },
    null,
    2,
  )}\n`,
  '.env': 'DATABASE_URL=postgres://u:secret@h/db\n',
});
