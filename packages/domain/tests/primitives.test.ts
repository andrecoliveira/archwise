import { describe, expect, test } from 'vitest';
import {
  checkRelativePath,
  compareCodeUnits,
  containsSecretPattern,
  isValidCode,
  isValidId,
  isValidLabel,
  isValidTimestamp,
  LIMITS,
} from '../src/index.js';
import { syntheticSecrets } from './secrets.js';

describe('isValidId', () => {
  test.each(['a', 'A9._:-x', 'a'.repeat(128)])('accepts %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });
  test.each(['', '-a', '.a', 'a b', 'é', 'a'.repeat(129)])('rejects %j', (id) => {
    expect(isValidId(id)).toBe(false);
  });
});

describe('isValidCode', () => {
  test.each(['manifest-declared', 'a', 'x1-y2'])('accepts %s', (code) => {
    expect(isValidCode(code)).toBe(true);
  });
  test.each(['', 'Upper', '1abc', 'a_b', 'a'.repeat(65)])('rejects %j', (code) => {
    expect(isValidCode(code)).toBe(false);
  });
});

describe('isValidLabel', () => {
  test.each(['🚀'.repeat(256), 'e\u0301', 'Service A'])('accepts %j', (label) => {
    expect(isValidLabel(label)).toBe(true);
  });
  test.each(['', '🚀'.repeat(257), 'a\u0000', 'a\u0085', 'a\u007f', 'line\nbreak'])(
    'rejects %j',
    (label) => {
      expect(isValidLabel(label)).toBe(false);
    },
  );
});

describe('isValidTimestamp', () => {
  test('accepts canonical UTC millisecond timestamps', () => {
    expect(isValidTimestamp('2026-11-15T10:20:30.000Z')).toBe(true);
  });
  test.each([
    '2026-02-30T00:00:00.000Z',
    '2026-11-15T10:20:30Z',
    '2026-11-15T10:20:30.000+00:00',
    '2026-11-15',
    'not a date',
  ])('rejects %s', (value) => {
    expect(isValidTimestamp(value)).toBe(false);
  });
});

describe('checkRelativePath', () => {
  test('accepts a normalized relative path', () => {
    expect(checkRelativePath('src/a.ts')).toBeNull();
    expect(checkRelativePath('packages/x/package.json')).toBeNull();
  });
  test.each([
    ['', 'empty'],
    ['/etc/x', 'absolute'],
    ['a\\b', 'backslash'],
    ['C:/x', 'drive-prefix'],
    ['a//b', 'empty-segment'],
    ['a/', 'empty-segment'],
    ['./a', 'dot-segment'],
    ['a/../b', 'dot-segment'],
    ['..', 'dot-segment'],
    ['a\u0000b', 'control-character'],
    ['a'.repeat(LIMITS.path + 1), 'too-long'],
  ] as const)('classifies %j as %s', (path, issue) => {
    expect(checkRelativePath(path)).toBe(issue);
  });
});

describe('containsSecretPattern', () => {
  test.each(Object.entries(syntheticSecrets))('detects %s', (_name, secret) => {
    expect(containsSecretPattern(`prefix ${secret} suffix`)).toBe(true);
  });
  test('ignores ordinary labels', () => {
    expect(containsSecretPattern('ordinary-label')).toBe(false);
    expect(containsSecretPattern('desk-lamp')).toBe(false);
  });
});

test('compareCodeUnits sorts by UTF-16 code unit, not locale', () => {
  expect(['b', 'B', 'a', '_'].sort(compareCodeUnits)).toEqual(['B', '_', 'a', 'b']);
  expect(compareCodeUnits('a', 'a')).toBe(0);
});
