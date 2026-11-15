import { expect, test } from 'vitest';
import {
  CONNECTION_INTENTS,
  explainConnection,
  isConnectionIntent,
  suggestedIntent,
} from './connection-intents.js';

test('supports the five named architectural connection intentions', () => {
  expect(CONNECTION_INTENTS).toEqual(['REQ', 'CACHE', 'DB', 'ASYNC', 'WORK']);
  expect(isConnectionIntent('CACHE')).toBe(true);
  expect(isConnectionIntent('UNKNOWN')).toBe(false);
});

test('suggests intent from a proposed source and target role', () => {
  expect(suggestedIntent('service', 'cache')).toBe('CACHE');
  expect(suggestedIntent('service', 'database')).toBe('DB');
  expect(suggestedIntent('service', 'queue')).toBe('ASYNC');
  expect(suggestedIntent('queue', 'service')).toBe('WORK');
  expect(suggestedIntent('service', 'service')).toBe('REQ');
});

test('provides actionable feedback for incompatible intent without changing it', () => {
  expect(explainConnection('service', 'service', 'CACHE')).toContain('Cache');
  expect(explainConnection('service', 'cache', 'DB')).toContain('Database');
  expect(explainConnection('service', 'service', 'ASYNC')).toContain('Queue');
  expect(explainConnection('service', 'service', 'WORK')).toContain('Queue');
  expect(explainConnection('queue', 'service', 'REQ')).toContain('WORK');
  expect(explainConnection('service', 'database', 'DB')).toBeNull();
  expect(explainConnection('queue', 'service', 'WORK')).toBeNull();
});
