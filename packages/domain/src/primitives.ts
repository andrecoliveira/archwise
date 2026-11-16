import { LIMITS } from './graph.js';

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CODE_PATTERN = /^[a-z][a-z0-9-]{0,63}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f-\u009f]/;
const DRIVE_PREFIX = /^[A-Za-z]:/;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

/** Counts Unicode code points, so length limits treat labels and paths the same way. */
const exceedsCodePoints = (value: string, max: number): boolean =>
  value.length > max && Array.from(value).length > max;

const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{36,}/,
  /xox[abprs]-[A-Za-z0-9-]{10,}/,
  // Word boundary so ordinary words ending in "sk" (mask-, disk-) are not flagged.
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\./,
];

// A home directory is a recognizable absolute prefix. The look-behind keeps relative paths such
// as `src/home/page` and route-like labels such as `/api/users` out of the match.
const HOME_PATH_SOURCES: readonly string[] = [
  String.raw`(?<![A-Za-z0-9._~-])(?:/var)?/(?:Users|home)/[^/\s"'<>|]+`,
  String.raw`(?<![A-Za-z0-9._~-])/root(?=[/\s"'<>|]|$)`,
  String.raw`(?<![A-Za-z0-9])[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"'<>|]+`,
];
const HOME_PATH_PATTERNS: readonly RegExp[] = HOME_PATH_SOURCES.map(
  (source) => new RegExp(source, 'i'),
);

export function isValidId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** Machine-readable reason and diagnostic codes. */
export function isValidCode(value: string): boolean {
  return CODE_PATTERN.test(value);
}

/** 1–256 well-formed Unicode code points without C0/C1 control characters. Spelling is preserved, never normalized. */
export function isValidLabel(value: string): boolean {
  if (value.length === 0 || CONTROL_CHARACTER.test(value) || LONE_SURROGATE.test(value)) {
    return false;
  }
  return !exceedsCodePoints(value, LIMITS.label);
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
  | 'control-character'
  | 'ill-formed-unicode';

/** Rejects (never repairs) paths that are not normalized, repository-relative and `/`-separated. */
export function checkRelativePath(value: string): PathIssue | null {
  if (value.length === 0) return 'empty';
  if (CONTROL_CHARACTER.test(value)) return 'control-character';
  if (LONE_SURROGATE.test(value)) return 'ill-formed-unicode';
  if (exceedsCodePoints(value, LIMITS.path)) return 'too-long';
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

/** Detects absolute home-directory paths (macOS, Linux, Windows), which identify the user and machine. */
export function containsHomePath(value: string): boolean {
  return HOME_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Replaces home-directory prefixes with `~` and known secret shapes with `[redacted]`.
 * Adapters use it on text read from analyzed projects before that text can reach a graph,
 * an export or an API response. Validation still rejects anything that slips through.
 */
export function redactSensitiveText(value: string): string {
  let result = value;
  for (const source of HOME_PATH_SOURCES) result = result.replace(new RegExp(source, 'gi'), '~');
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, 'g'), '[redacted]');
  }
  return result;
}

/** Locale-independent ordering by UTF-16 code unit. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
