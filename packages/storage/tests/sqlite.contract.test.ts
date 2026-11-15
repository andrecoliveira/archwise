import { defineStoreContract } from '@archwise/application/testing';
import { expect, test } from 'vitest';
import { openStore } from '../src/index.js';
import { tempDir } from './helpers.js';

defineStoreContract(
  'sqlite',
  async () => {
    const dir = tempDir();
    const store = await openStore(dir.path);
    return {
      store,
      dispose() {
        store.close();
        dir.dispose();
      },
    };
  },
  { test, expect },
);
