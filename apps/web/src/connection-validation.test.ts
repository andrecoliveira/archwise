import { expect, test } from 'vitest';
import { validateProposedConnection, CONNECTION_HELP_TEXT } from './connection-validation.js';

const ids = new Set(['sandbox-1', 'sandbox-2', 'sandbox-3']);

test('validates the direction and excludes discovered packages', () => {
  expect(validateProposedConnection('sandbox-1', 'sandbox-2', ids, [])).toEqual({ valid: true });
  expect(validateProposedConnection('package:web', 'sandbox-1', ids, []).valid).toBe(false);
  expect(validateProposedConnection('sandbox-1', 'sandbox-1', ids, []).valid).toBe(false);
});

test('prevents duplicate edges and cycles before adding them to the canvas', () => {
  const edges = [
    { source: 'sandbox-1', target: 'sandbox-2' },
    { source: 'sandbox-2', target: 'sandbox-3' },
  ];
  expect(validateProposedConnection('sandbox-1', 'sandbox-2', ids, edges)).toMatchObject({
    valid: false,
    reason: expect.stringContaining('already connected'),
  });
  expect(validateProposedConnection('sandbox-3', 'sandbox-1', ids, edges)).toMatchObject({
    valid: false,
    reason: expect.stringContaining('cycle'),
  });
  expect(validateProposedConnection('sandbox-1', 'sandbox-3', ids, edges)).toEqual({ valid: true });
});

test('describes semantic intent without claiming simulator behavior', () => {
  expect(CONNECTION_HELP_TEXT.CACHE).toContain('cache');
  expect(CONNECTION_HELP_TEXT.ASYNC).toContain('queue');
  expect(CONNECTION_HELP_TEXT.WORK).toContain('queue');
});
