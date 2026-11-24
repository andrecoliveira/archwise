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

// Generic home-directory shapes that ordinary route labels do not use: the macOS `/Users/<name>`
// (case-sensitive, so the common `/users/:id` route stays intact) and the Windows
// `X:\Users\<name>`. The Windows form runs first so `C:/Users/x` is replaced as one unit.
// Linux `/home/<name>` and `/root` collide with routes, so adapters pass the real home directory.
const HOME_PATH_RULES: readonly { readonly source: string; readonly flags: string }[] = [
  {
    source: String.raw`(?<![A-Za-z0-9])[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"'<>|()]+`,
    flags: 'i',
  },
  { source: String.raw`(?<![A-Za-z0-9._~-])/Users/[^/\\\s"'<>|()]+`, flags: '' },
];
const HOME_PATH_PATTERNS: readonly RegExp[] = HOME_PATH_RULES.map(
  (rule) => new RegExp(rule.source, rule.flags),
);
// Redaction removes the whole token or block, not only the prefix that detection needs.
const SECRET_REDACTIONS: readonly RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /AKIA[0-9A-Z]{16}/g,
  /gh[pousr]_[A-Za-z0-9]{36,}/g,
  /xox[abprs]-[A-Za-z0-9-]{10,}/g,
  /(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g,
];
const PATH_END = String.raw`(?=$|[\\/\s"'<>|()])`;
/** Linear-time trim; an anchored `[\\/]+$` regex is polynomial on long runs of separators. */
function trimTrailingSeparators(path: string): string {
  let end = path.length;
  while (end > 0 && (path[end - 1] === '/' || path[end - 1] === '\\')) end--;
  return path.slice(0, end);
}
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

/**
 * Detects the generic home-directory shapes (`/Users/<name>`, `X:\Users\<name>`), which identify
 * the user and machine. Linux homes are only recognizable when the adapter knows them.
 */
export function containsHomePath(value: string): boolean {
  return HOME_PATH_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Replaces known secret shapes with `[redacted]`, then home directories with `~`: the generic
 * shapes plus each of `knownHomes` (the running user's real home directory, supplied by the
 * adapter). It repeats until nothing changes, so removing one piece cannot reassemble another.
 * Adapters use it on text read from analyzed projects; validation still rejects what slips through.
 */
export function redactSensitiveText(value: string, knownHomes: readonly string[] = []): string {
  const homes = knownHomes
    .map(trimTrailingSeparators)
    .filter((home) => home.length > 1)
    .map((home) => new RegExp(escapeRegExp(home) + PATH_END, 'g'));
  let current = value;
  for (let pass = 0; pass < 8; pass++) {
    let next = current;
    for (const pattern of SECRET_REDACTIONS) next = next.replace(pattern, '[redacted]');
    for (const rule of HOME_PATH_RULES) {
      next = next.replace(new RegExp(rule.source, `g${rule.flags}`), '~');
    }
    for (const home of homes) next = next.replace(home, '~');
    if (next === current) break;
    current = next;
  }
  return current;
}

const URL_CREDENTIALS = /(?<![a-z0-9+.-])([a-z][a-z0-9+.-]*:\/\/)[^\s/@'"]+@/gi;
/** A whole key token, an optional closing quote, its separator, then a quoted or bare value. */
const KEY_VALUE =
  /(?<![A-Za-z0-9_.-])([A-Za-z0-9_.-]+)(["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,}\]][^\n,}\]]*)/g;
const SECRET_KEY_NAME = /password|passwd|secret|token|key/i;

/**
 * Masks configuration values and excerpt lines before they are shown or stored: everything
 * `redactSensitiveText` masks, credentials in URLs (`scheme://user:pass@`), and the value of
 * any key named like a password, secret, token or key. Errs towards masking.
 */
export function maskConfigValue(value: string): string {
  return redactSensitiveText(value)
    .replace(URL_CREDENTIALS, '$1[redacted]@')
    .replace(KEY_VALUE, (whole, key: string, separator: string) =>
      SECRET_KEY_NAME.test(key) ? `${key}${separator}[redacted]` : whole,
    );
}

/** Locale-independent ordering by UTF-16 code unit. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
