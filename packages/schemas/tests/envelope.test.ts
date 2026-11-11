import { expect, test } from 'vitest';
import { snapshotEnvelopeSchema } from '../src/index.js';
test('accepts only an explicitly versioned envelope', () => {
  expect(snapshotEnvelopeSchema.parse({ version: 1 })).toEqual({ version: 1 });
});
test.each([{}, { version: 2 }, { version: '1' }, { version: 1, secret: 'must not survive' }, null])(
  'rejects malformed or unsupported envelopes: %j',
  (input) => {
    expect(snapshotEnvelopeSchema.safeParse(input).success).toBe(false);
  },
);
