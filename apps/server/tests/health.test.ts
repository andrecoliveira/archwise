import { expect, test } from 'vitest';
import { healthPayload } from '../src/index.js';
test('reports foundation status as immutable data', () => {
  const result = healthPayload();
  expect(result).toEqual({ name: 'archwise', status: 'foundation' });
  expect(Object.isFrozen(result)).toBe(true);
});
