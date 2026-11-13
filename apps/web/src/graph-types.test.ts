import { expect, test } from 'vitest';
import { isGraph } from './graph-types.js';

test('accepts a supported evidence-backed architecture graph', () => {
  expect(isGraph({
    version: 1,
    nodes: [
      {
        id: 'package:package.json',
        type: 'package',
        label: 'example',
        origin: 'discovered',
        framework: null,
        evidence: [{ path: 'package.json', kind: 'package-manifest' }],
      },
    ],
    edges: [],
    diagnostics: [],
    inspectedEntries: 1,
  })).toBe(true);
});

test('rejects incompatible and incomplete graph envelopes', () => {
  expect(isGraph(null)).toBe(false);
  expect(isGraph({ version: 2, nodes: [], edges: [], diagnostics: [], inspectedEntries: 1 })).toBe(false);
  expect(isGraph({ version: 1, nodes: [null], edges: [], diagnostics: [], inspectedEntries: 1 })).toBe(false);
  expect(isGraph({ version: 1, nodes: [], edges: [{ id: 'broken' }], diagnostics: [], inspectedEntries: 1 })).toBe(false);
});
