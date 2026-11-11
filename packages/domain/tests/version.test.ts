import { expect, test } from 'vitest';
import { CURRENT_SNAPSHOT_VERSION } from '../src/index.js';
test('publishes the supported snapshot version', () => {
  expect(CURRENT_SNAPSHOT_VERSION).toBe(1);
});
