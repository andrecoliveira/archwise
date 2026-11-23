import { expect, test } from 'vitest';
import { discoveredNode, graphOf } from './graph-fixtures.js';
import type { Graph } from './graph-types.js';
import { relativeTime, revisionChip, workspaceName, type ChipInput } from './scan-status.js';
import { isScanSummary, type ScanSummaryView } from './scan-summary.js';

const NOW = Date.parse('2026-11-23T10:02:00Z');

function scanAt(scannedAt: string | undefined, overrides: Partial<ScanSummaryView> = {}): ScanSummaryView {
  return {
    version: 1,
    ...(scannedAt === undefined ? {} : { scannedAt }),
    listedEntries: 10,
    skipped: {},
    truncated: null,
    repositories: [
      { id: 'r1', label: 'shop', nested: false, reached: true, listedEntries: 10, manifests: 2, skipped: {} },
    ],
    ...overrides,
  };
}

const graph: Graph = graphOf([discoveredNode('package:package.json')]);

function chip(overrides: Partial<ChipInput>) {
  return revisionChip({
    scan: scanAt('2026-11-23T10:00:00Z'),
    graph,
    storeEnabled: true,
    historical: false,
    now: NOW,
    ...overrides,
  });
}

test('complete scan', () => {
  expect(chip({})).toEqual({ text: 'scanned 2 min ago · complete', status: 'complete', reasons: [] });
});

test('truncated scan is partial with its reason', () => {
  const result = chip({ scan: scanAt('2026-11-23T10:00:00Z', { truncated: 'time' }) });
  expect(result.status).toBe('partial');
  expect(result.text).toBe('scanned 2 min ago · partial');
  expect(result.reasons).toEqual(['the time budget ran out']);
});

test('unreached repository is partial', () => {
  const scan = scanAt('2026-11-23T10:00:00Z', {
    repositories: [
      { id: 'r1', label: 'shop', nested: false, reached: true, listedEntries: 10, manifests: 2, skipped: {} },
      { id: 'r2', label: 'lib', nested: true, reached: false, listedEntries: 0, manifests: 0, skipped: {} },
    ],
  });
  expect(chip({ scan }).reasons).toEqual(['lib was not scanned']);
});

test('failed analyzer is partial', () => {
  const failing = graphOf([], [], {
    diagnostics: ['Analyzer failed: docker-compose in shop. Its findings were discarded.'],
  });
  expect(chip({ graph: failing })).toMatchObject({ status: 'partial', reasons: ['an analyzer failed'] });
});

test('an analyzer out of budget is partial', () => {
  const budget = graphOf([], [], { gaps: [{ path: 'a.yaml', analyzer: 'docker-compose', reason: 'budget' }] });
  expect(chip({ graph: budget }).reasons).toEqual(['an analyzer ran out of budget']);
});

test('reasons keep their order', () => {
  const failing = graphOf([], [], { diagnostics: ['Analyzer failed: x in shop. Its findings were discarded.'] });
  const scan = scanAt('2026-11-23T10:00:00Z', { truncated: 'entries' });
  expect(chip({ scan, graph: failing }).reasons).toEqual(['the entries budget ran out', 'an analyzer failed']);
});

test('store off adds not saved', () => {
  expect(chip({ storeEnabled: false, now: Date.parse('2026-11-23T10:00:10Z') }).text).toBe(
    'scanned just now · complete · not saved',
  );
});

test('revisionChip without scannedAt', () => {
  expect(chip({ scan: scanAt(undefined) }).text).toBe('scan time unknown · complete');
});

test('revisionChip without a scan summary', () => {
  expect(chip({ scan: null }).text).toBe('complete');
});

test('revisionChip marks historical views', () => {
  expect(chip({ historical: true }).text).toBe('scanned 2 min ago · complete · viewing an earlier architecture');
});

test('relativeTime', () => {
  expect(relativeTime('2026-11-23T10:00:00Z', Date.parse('2026-11-23T10:00:30Z'))).toBe('just now');
  expect(relativeTime('2026-11-23T09:15:00Z', Date.parse('2026-11-23T10:00:00Z'))).toBe('45 min ago');
  expect(relativeTime('2026-11-23T08:00:00Z', Date.parse('2026-11-23T10:00:00Z'))).toBe('2 h ago');
  expect(relativeTime('2026-11-20T08:00:00Z', Date.parse('2026-11-23T10:00:00Z'))).toMatch(/^2026-11-(19|20)$/);
  expect(relativeTime('nonsense', 0)).toBeNull();
});

test('isScanSummary accepts a summary without scannedAt and rejects an unparseable one', () => {
  expect(isScanSummary(scanAt(undefined))).toBe(true);
  expect(isScanSummary(scanAt('2026-11-23T10:00:00Z'))).toBe(true);
  expect(isScanSummary({ ...scanAt(undefined), scannedAt: 'x' })).toBe(false);
  expect(isScanSummary({ ...scanAt(undefined), scannedAt: 42 })).toBe(false);
});

test('workspaceName is the repository label, a count, or a fallback', () => {
  expect(workspaceName(scanAt(undefined))).toBe('shop');
  const three = scanAt(undefined, {
    repositories: ['a', 'b', 'c'].map((label) => ({
      id: label, label, nested: false, reached: true, listedEntries: 1, manifests: 1, skipped: {},
    })),
  });
  expect(workspaceName(three)).toBe('3 repositories');
  expect(workspaceName(null)).toBe('Workspace');
});
