import { expect, test } from 'vitest';
import { createApplicationInfo } from '../src/index.js';
test('exposes immutable version metadata', () => {
  const info = createApplicationInfo();
  expect(info).toEqual({ snapshotVersion: 1 });
  expect(Object.isFrozen(info)).toBe(true);
});
