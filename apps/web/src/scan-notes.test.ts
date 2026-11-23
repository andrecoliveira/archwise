import { expect, test } from 'vitest';
import { graphOf } from './graph-fixtures.js';
import { GAP_REASONS, type GapReason, type GraphGap } from './graph-types.js';
import { GAP_REASON_TEXT, scanNotes } from './scan-notes.js';

const gap = (path: string, reason: GapReason, analyzer = 'docker-compose'): GraphGap => ({ path, analyzer, reason });

test('headline counts files and notes', () => {
  const view = scanNotes(graphOf([], [], { gaps: [gap('compose.prod.yaml', 'unsupported')], diagnostics: ['a', 'b'] }));
  expect(view.headline).toBe('1 file not analyzed · 2 notes');
});

test('headline uses plurals and drops zero parts', () => {
  expect(scanNotes(graphOf([], [], { diagnostics: ['a'] })).headline).toBe('1 note');
  const files = [gap('a.yaml', 'unsupported'), gap('b.yaml', 'invalid-syntax')];
  expect(scanNotes(graphOf([], [], { gaps: files })).headline).toBe('2 files not analyzed');
});

test('nothing to report', () => {
  expect(scanNotes(graphOf([])).headline).toBe('Nothing to report');
});

test('every gap reason has text', () => {
  for (const reason of GAP_REASONS) expect(GAP_REASON_TEXT[reason]).toMatch(/\S/);
});

test('gaps read as file and reason', () => {
  const view = scanNotes(graphOf([], [], { gaps: [gap('compose.prod.yaml', 'unsupported')] }));
  expect(view.gaps).toEqual([{ path: 'compose.prod.yaml', reason: 'not supported yet' }]);
});

test('gaps sort by path then reason', () => {
  const view = scanNotes(
    graphOf([], [], {
      gaps: [gap('b.yaml', 'unsupported'), gap('a.yaml', 'too-large'), gap('a.yaml', 'binary')],
    }),
  );
  expect(view.gaps).toEqual([
    { path: 'a.yaml', reason: 'binary file' },
    { path: 'a.yaml', reason: 'too large to analyze' },
    { path: 'b.yaml', reason: 'not supported yet' },
  ]);
});

test('one file missed by two analyzers for the same reason is listed once', () => {
  const view = scanNotes(graphOf([], [], { gaps: [gap('x.yaml', 'binary', 'a'), gap('x.yaml', 'binary', 'b')] }));
  expect(view.gaps).toHaveLength(1);
  expect(view.headline).toBe('1 file not analyzed');
});

test('no diagnostic is dropped', () => {
  const diagnostics = ['one', 'two', 'three', 'four', 'five'];
  expect(scanNotes(graphOf([], [], { diagnostics })).notes).toEqual(diagnostics);
});
