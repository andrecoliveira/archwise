import { expect, test } from 'vitest';
import { inspectSandboxText, MAX_SANDBOX_BYTES } from '../src/index.js';

test('summarizes a minimal valid sandbox document', () => {
  expect(
    inspectSandboxText(
      '{"format":"archwise-sandbox","version":1,"nodes":[{}],"draft":{"savedA":null,"savedB":{}}}',
    ),
  ).toEqual({ ok: true, summary: { componentCount: 1, hasSnapshots: true } });
});

test('reports no snapshots when both slots are null', () => {
  expect(
    inspectSandboxText(
      '{"format":"archwise-sandbox","version":1,"nodes":[],"draft":{"savedA":null,"savedB":null}}',
    ),
  ).toEqual({ ok: true, summary: { componentCount: 0, hasSnapshots: false } });
});

test.each([
  'not json',
  '[]',
  'null',
  '{"format":"other","version":1,"nodes":[],"draft":{}}',
  '{"format":"archwise-sandbox","version":2,"nodes":[],"draft":{}}',
  '{"format":"archwise-sandbox","version":1,"nodes":{},"draft":{}}',
  '{"format":"archwise-sandbox","version":1,"nodes":[]}',
  '{"format":"archwise-sandbox","version":1,"nodes":[],"draft":[]}',
  '{"__proto__":{}}',
])('rejects %s without throwing', (text) => {
  expect(inspectSandboxText(text)).toEqual({ ok: false, code: 'invalid-sandbox' });
});

test('rejects documents above the byte limit', () => {
  const padding = ' '.repeat(MAX_SANDBOX_BYTES + 1);
  expect(inspectSandboxText(`${padding}{}`)).toEqual({ ok: false, code: 'too-large' });
});
