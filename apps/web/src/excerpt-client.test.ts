import { expect, test, vi } from 'vitest';
import { discoveredNode, graphOf } from './graph-fixtures.js';
import { evidenceKey } from './reason-catalog.js';
import { excerptIdsFrom, excerptMessage, fetchExcerpt } from './excerpt-client.js';

const ID = 'a'.repeat(64);
const reply = (status: number, body: unknown) =>
  vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status })));

test('fetches an excerpt by id and returns its lines', async () => {
  const body = { status: 'ok', path: 'compose.yaml', start: 2, end: 3, lines: ['a', 'b'] };
  const fetcher = reply(200, body);
  expect(await fetchExcerpt(ID, fetcher)).toEqual(body);
  expect(fetcher).toHaveBeenCalledWith(`/api/v1/evidence/excerpt/${ID}`, {
    credentials: 'same-origin',
  });
});

test('unavailable and changed results come back as they are', async () => {
  const unavailable = { status: 'unavailable', reason: 'denied' };
  expect(await fetchExcerpt(ID, reply(422, unavailable))).toEqual(unavailable);
  expect(await fetchExcerpt(ID, reply(200, { status: 'changed' }))).toEqual({ status: 'changed' });
});

test('anything else is an error, and a malformed id is never requested', async () => {
  expect(await fetchExcerpt(ID, reply(404, { error: 'Not found' }))).toEqual({ status: 'error' });
  expect(await fetchExcerpt(ID, reply(200, { status: 'ok', lines: [1] }))).toEqual({
    status: 'error',
  });
  const failing = vi.fn(() => Promise.reject(new Error('offline')));
  expect(await fetchExcerpt(ID, failing)).toEqual({ status: 'error' });
  const never = vi.fn();
  expect(await fetchExcerpt('../graph', never)).toEqual({ status: 'error' });
  expect(never).not.toHaveBeenCalled();
});

test('each result has a sentence', () => {
  expect(excerptMessage({ status: 'changed' })).toBe('This file changed since the scan.');
  expect(excerptMessage({ status: 'unavailable', reason: 'denied' })).toBe(
    'Not shown: this file is on the deny list.',
  );
  expect(excerptMessage({ status: 'unavailable', reason: 'outside-root' })).toBe(
    'Not shown: the file is outside the scanned folder or behind a link.',
  );
  expect(excerptMessage({ status: 'unavailable', reason: 'too-long' })).toBe(
    'Not shown: the cited range is longer than 40 lines.',
  );
  expect(excerptMessage({ status: 'unavailable', reason: 'too-large' })).toBe(
    "Not shown: the file is larger than the scan's size limit.",
  );
  expect(excerptMessage({ status: 'unavailable', reason: 'not-utf8' })).toBe(
    'Not shown: the file is not UTF-8 text.',
  );
  expect(excerptMessage({ status: 'unavailable', reason: 'unreadable' })).toBe(
    'Not shown: the file could not be read.',
  );
  expect(excerptMessage({ status: 'error' })).toBe('Could not load the lines. Try again.');
});

test('excerptIdsFrom maps evidence keys to the latest scan ids', () => {
  const item = { path: 'package.json', kind: 'package-manifest', lines: null, analyzer: 'm' };
  const graph = graphOf([
    discoveredNode('a', { evidence: [{ ...item, excerptId: ID }] }),
    discoveredNode('b', { evidence: [{ ...item, path: 'b/package.json' }] }),
  ]);
  const ids = excerptIdsFrom(graph);
  expect(ids.get(evidenceKey(item))).toBe(ID);
  expect(ids.size).toBe(1);
});
