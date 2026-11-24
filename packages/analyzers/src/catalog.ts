import type { ExternalCategory, ResourceKind } from '@archwise/application';

/*
 * Curated, versioned catalogs used by the built-in analyzers. They are data: tests read them,
 * and `docs/discovery.md` points here as the authoritative list. Changing an entry changes
 * what the graph shows, so it is a version bump of the analyzer that uses it.
 */

export interface RoleEntry {
  readonly dependency: string;
  readonly role: 'frontend' | 'service';
}

/** In priority order: frontend frameworks first, then server frameworks. */
export const ROLE_CATALOG: readonly RoleEntry[] = Object.freeze([
  ...[
    'next',
    'nuxt',
    '@sveltejs/kit',
    '@remix-run/react',
    'astro',
    '@angular/core',
    'vue',
    'svelte',
    'solid-js',
    'react-dom',
    'expo',
    'react-native',
  ].map((dependency) => ({ dependency, role: 'frontend' as const })),
  ...[
    'express',
    'fastify',
    '@nestjs/core',
    'koa',
    'hono',
    '@hapi/hapi',
    '@apollo/server',
    '@trpc/server',
  ].map((dependency) => ({ dependency, role: 'service' as const })),
]);

export interface ResourceEntry {
  readonly kind: ResourceKind;
  readonly technology: string;
  readonly label: string;
}

export interface LibraryEntry extends ResourceEntry {
  readonly dependency: string;
  /** External systems only: what it is for. */
  readonly category?: ExternalCategory;
}

export interface ImageEntry extends ResourceEntry {
  /** Normalized image repository name: no registry host, tag, digest or `library/`. */
  readonly image: string;
}

export const UNKNOWN_SQL = Object.freeze({
  technology: 'unknown-sql',
  label: 'Database (unknown engine)',
});

const entries = <T extends string>(
  key: T,
  kind: ResourceKind,
  technology: string,
  label: string,
  names: readonly string[],
): (ResourceEntry & Record<T, string>)[] =>
  names.map(
    (name) => ({ [key]: name, kind, technology, label }) as ResourceEntry & Record<T, string>,
  );

const external = (
  technology: string,
  label: string,
  category: ExternalCategory,
  names: readonly string[],
): LibraryEntry[] =>
  entries('dependency', 'external-system', technology, label, names).map((entry) => ({
    ...entry,
    category,
  }));

export const LIBRARY_CATALOG: readonly LibraryEntry[] = Object.freeze([
  ...entries('dependency', 'datastore', 'postgresql', 'PostgreSQL', ['pg', 'postgres']),
  ...entries('dependency', 'datastore', 'mysql', 'MySQL', ['mysql2']),
  ...entries('dependency', 'datastore', 'mongodb', 'MongoDB', ['mongodb', 'mongoose']),
  ...entries('dependency', 'datastore', 'redis', 'Redis', ['redis', 'ioredis']),
  ...entries('dependency', 'datastore', 'sqlite', 'SQLite', ['better-sqlite3']),
  ...entries('dependency', 'datastore', 'elasticsearch', 'Elasticsearch', [
    '@elastic/elasticsearch',
  ]),
  ...entries('dependency', 'datastore', 'dynamodb', 'DynamoDB', ['@aws-sdk/client-dynamodb']),
  ...entries('dependency', 'datastore', UNKNOWN_SQL.technology, UNKNOWN_SQL.label, [
    '@prisma/client',
    'typeorm',
    'sequelize',
    'drizzle-orm',
    'knex',
  ]),
  ...entries('dependency', 'queue', 'bullmq', 'BullMQ', ['bullmq', 'bull']),
  ...entries('dependency', 'queue', 'rabbitmq', 'RabbitMQ', ['amqplib']),
  ...entries('dependency', 'queue', 'kafka', 'Kafka', ['kafkajs']),
  ...entries('dependency', 'queue', 'sqs', 'Amazon SQS', ['@aws-sdk/client-sqs']),
  ...entries('dependency', 'queue', 'pubsub', 'Google Pub/Sub', ['@google-cloud/pubsub']),
  ...entries('dependency', 'queue', 'nats', 'NATS', ['nats']),
  ...external('stripe', 'Stripe', 'payments', ['stripe']),
  ...external('sendgrid', 'SendGrid', 'email', ['@sendgrid/mail']),
  ...external('resend', 'Resend', 'email', ['resend']),
  ...external('twilio', 'Twilio', 'other', ['twilio']),
  ...external('s3', 'Amazon S3', 'storage', ['@aws-sdk/client-s3']),
  ...external('firebase', 'Firebase', 'other', ['firebase-admin']),
  ...external('sentry', 'Sentry', 'monitoring', ['@sentry/node']),
  ...external('openai', 'OpenAI', 'ai', ['openai']),
  ...external('anthropic', 'Anthropic', 'ai', ['@anthropic-ai/sdk']),
  ...external('slack', 'Slack', 'other', ['@slack/web-api']),
]);

export const IMAGE_CATALOG: readonly ImageEntry[] = Object.freeze([
  ...entries('image', 'datastore', 'postgresql', 'PostgreSQL', ['postgres']),
  ...entries('image', 'datastore', 'mysql', 'MySQL', ['mysql', 'mariadb']),
  ...entries('image', 'datastore', 'mongodb', 'MongoDB', ['mongo']),
  ...entries('image', 'datastore', 'redis', 'Redis', ['redis', 'valkey', 'valkey/valkey']),
  ...entries('image', 'datastore', 'elasticsearch', 'Elasticsearch', ['elasticsearch']),
  ...entries('image', 'datastore', 's3', 'Amazon S3-compatible (MinIO)', ['minio/minio']),
  ...entries('image', 'queue', 'rabbitmq', 'RabbitMQ', ['rabbitmq']),
  ...entries('image', 'queue', 'kafka', 'Kafka', ['confluentinc/cp-kafka', 'bitnami/kafka']),
  ...entries('image', 'queue', 'nats', 'NATS', ['nats']),
]);
