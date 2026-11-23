import { expect, test } from 'vitest';
import { discoveredNode } from './graph-fixtures.js';
import {
  isScanSummary,
  nodeDisplayLabel,
  repositoryLines,
  scanHeadline,
  skippedLine,
  type ScanSummaryView,
} from './scan-summary.js';

const summary: ScanSummaryView = {
  version: 1,
  listedEntries: 120,
  skipped: { 'ignored-builtin': 3, symlink: 1 },
  truncated: null,
  repositories: [
    {
      id: 'repo-a',
      label: 'api',
      nested: false,
      reached: true,
      listedEntries: 80,
      manifests: 1,
      skipped: { 'ignored-builtin': 3 },
    },
    {
      id: 'repo-w',
      label: 'web',
      nested: false,
      reached: false,
      listedEntries: 0,
      manifests: 0,
      skipped: {},
    },
  ],
};

test('validates the scan summary payload', () => {
  expect(isScanSummary(summary)).toBe(true);
  expect(isScanSummary({ ...summary, version: 2 })).toBe(false);
  expect(isScanSummary({ ...summary, repositories: [{ id: 'x' }] })).toBe(false);
  expect(isScanSummary({ ...summary, skipped: { x: 'many' } })).toBe(false);
  expect(isScanSummary(null)).toBe(false);
});

test('the headline counts repositories and entries, and flags a partial scan', () => {
  expect(scanHeadline(summary)).toBe('Scan · 2 repositories · 120 entries');
  expect(scanHeadline({ ...summary, truncated: 'entries', listedEntries: 1 })).toBe(
    'Scan · 2 repositories · 1 entry · partial',
  );
  expect(scanHeadline({ ...summary, repositories: [summary.repositories[0]!] })).toBe(
    'Scan · 1 repository · 120 entries',
  );
});

test('repository lines show counts or that a budget ran out first', () => {
  expect(repositoryLines(summary)).toEqual([
    'api: 1 manifest, 80 entries',
    'web: not scanned, a budget ran out first',
  ]);
});

test('the skipped line lists reasons in a stable order', () => {
  expect(skippedLine(summary)).toBe('Skipped: ignored-builtin 3, symlink 1');
  expect(skippedLine({ ...summary, skipped: {} })).toBeNull();
});

test('node labels add the repository when there is one', () => {
  const node = discoveredNode('package:package.json', {
    label: '@shop/api',
    technology: 'fastify',
  });
  expect(nodeDisplayLabel(node)).toBe('@shop/api · fastify');
  expect(nodeDisplayLabel({ ...node, technology: null })).toBe('@shop/api · Library');
  expect(nodeDisplayLabel({ ...node, technology: null, type: 'datastore' })).toBe(
    '@shop/api · Datastore',
  );
  expect(nodeDisplayLabel({ ...node, repository: { id: 'repo-a', label: 'api' } })).toBe(
    '@shop/api · fastify · api',
  );
});

