import { LIMITS } from './graph.js';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CODE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const DRIVE_PREFIX = /^[A-Za-z]:/;

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  // Word boundary so ordinary words ending in "sk" (mask-, disk-) are not flagged.
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
];

export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** Machine-readable reason and diagnostic codes. */
export function isValidCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** 1–256 Unicode code points without C0/C1 control characters. Spelling is preserved, never normalized. */
export function isValidLabel(value: string): boolean {
  if (value.length === 0 || CONTROL_CHARACTER.test(value)) return false;
  // Every UTF-16 unit is at most one code point, so short strings skip the iteration.
  if (value.length <= LIMITS.label) return true;
  return Array.from(value).length <= LIMITS.label;
}

/** Canonical UTC timestamp with millisecond precision that names a real calendar instant. */
export function isValidTimestamp(value: string): boolean {
  if (!TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export type PathIssue =
  | 'empty'
  | 'too-long'
  | 'absolute'
  | 'backslash'
  | 'drive-prefix'
  | 'empty-segment'
  | 'dot-segment'
  | 'control-character';

/** Rejects (never repairs) paths that are not normalized, repository-relative and `/`-separated. */
export function checkRelativePath(value: string): PathIssue | null {
  if (value.length === 0) return 'empty';
  if (value.length > LIMITS.path) return 'too-long';
  if (CONTROL_CHARACTER.test(value)) return 'control-character';
  if (value.includes('\\')) return 'backslash';
  if (value.startsWith('/')) return 'absolute';
  if (DRIVE_PREFIX.test(value)) return 'drive-prefix';
  for (const segment of value.split('/')) {
    if (segment.length === 0) return 'empty-segment';
    if (segment === '.' || segment === '..') return 'dot-segment';
  }
  return null;
}

/** Defense in depth against known credential shapes; not proof that a string is free of secrets. */
export function containsSecretPattern(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

/** Locale-independent ordering by UTF-16 code unit. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
