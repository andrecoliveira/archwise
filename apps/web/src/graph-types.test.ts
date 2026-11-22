import { expect, test } from 'vitest';
import { isGraph } from './graph-types.js';

test('accepts a supported evidence-backed architecture graph', () => {
  expect(
    isGraph({
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
    }),
  ).toBe(true);
});

test('rejects incompatible and incomplete graph envelopes', () => {
  expect(isGraph(null)).toBe(false);
  expect(isGraph({ version: 2, nodes: [], edges: [], diagnostics: [], inspectedEntries: 1 })).toBe(
    false,
  );
  expect(
    isGraph({ version: 1, nodes: [null], edges: [], diagnostics: [], inspectedEntries: 1 }),
  ).toBe(false);
  expect(
    isGraph({
      version: 1,
      nodes: [],
      edges: [{ id: 'broken' }],
      diagnostics: [],
      inspectedEntries: 1,
    }),
  ).toBe(false);
});

test('a node may name its repository, which must be an id and label', () => {
  const graphWith = (repository: unknown) => ({
    version: 1,
    nodes: [
      {
        id: 'package:repo-1/package.json',
        type: 'package',
        label: 'example',
        origin: 'discovered',
        framework: null,
        evidence: [{ path: 'package.json', kind: 'package-manifest' }],
        ...(repository === undefined ? {} : { repository }),
      },
    ],
    edges: [],
    diagnostics: [],
    inspectedEntries: 1,
  });
  expect(isGraph(graphWith(undefined))).toBe(true);
  expect(isGraph(graphWith({ id: 'repo-1', label: 'api' }))).toBe(true);
  expect(isGraph(graphWith('api'))).toBe(false);
  expect(isGraph(graphWith({ id: 'repo-1' }))).toBe(false);
});
