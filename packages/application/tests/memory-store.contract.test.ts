import { expect, test } from 'vitest';
import { createMemoryStore } from '../src/index.js';
import { defineStoreContract } from '../src/testing/index.js';

defineStoreContract('memory', () => ({ store: createMemoryStore(), dispose() {} }), {
  test,
  expect,
});
