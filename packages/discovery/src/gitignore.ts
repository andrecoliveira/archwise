/*
 * A small gitignore matcher: comments, escapes, negation, anchoring, directory-only rules,
 * `*`, `?`, `[...]` and `**`. It uses no regular expressions. A segment is matched with
 * single-star backtracking (O(pattern × name)), and `**` segments with a memoised table
 * (O(pattern segments × path segments²)), so a hostile .gitignore cannot stall a scan.
 */

type Token =
  | { readonly kind: 'literal'; readonly char: string }
  | { readonly kind: 'any' }
  | { readonly kind: 'star' }
  | {
      readonly kind: 'class';
      readonly negated: boolean;
      readonly ranges: readonly (readonly [string, string])[];
    };

type Segment =
  { readonly kind: 'globstar' } | { readonly kind: 'tokens'; readonly tokens: Token[] };

interface Rule {
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  /** Matched against the basename when unanchored, else against the base-relative path. */
  readonly anchored: boolean;
  readonly segments: readonly Segment[];
}

export interface IgnoreRules {
  /** Directory of the .gitignore, relative to the repository root ('' for the root). */
  readonly directory: string;
  readonly rules: readonly Rule[];
}

function trimTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === ' ' && line[end - 2] !== '\\') end--;
  return line.slice(0, end);
}

/** Parses a bracket expression whose `[` is at `start`; null when unterminated. */
function parseClass(chars: string[], start: number): { token: Token; next: number } | null {
  let index = start + 1;
  let negated = false;
  if (chars[index] === '!' || chars[index] === '^') {
    negated = true;
    index++;
  }
  const ranges: [string, string][] = [];
  let first = true;
  while (index < chars.length && (chars[index] !== ']' || first)) {
    first = false;
    let low = chars[index]!;
    if (low === '\\' && index + 1 < chars.length) low = chars[++index]!;
    index++;
    if (chars[index] === '-' && index + 1 < chars.length && chars[index + 1] !== ']') {
      let high = chars[index + 1]!;
      index += 2;
      if (high === '\\' && index < chars.length) high = chars[index++]!;
      // An inverted range such as [z-a] matches nothing, as in Git.
      if (low <= high) ranges.push([low, high]);
    } else {
      ranges.push([low, low]);
    }
  }
  if (index >= chars.length) return null;
  return { token: { kind: 'class', negated, ranges }, next: index + 1 };
}

function parseSegment(text: string): Segment {
  if (text === '**') return { kind: 'globstar' };
  const chars = Array.from(text);
  const tokens: Token[] = [];
  for (let index = 0; index < chars.length;) {
    const char = chars[index]!;
    if (char === '*') {
      if (tokens[tokens.length - 1]?.kind !== 'star') tokens.push({ kind: 'star' });
      index++;
    } else if (char === '?') {
      tokens.push({ kind: 'any' });
      index++;
    } else if (char === '[') {
      const parsed = parseClass(chars, index);
      if (parsed === null) {
        tokens.push({ kind: 'literal', char });
        index++;
      } else {
        tokens.push(parsed.token);
        index = parsed.next;
      }
    } else if (char === '\\' && index + 1 < chars.length) {
      tokens.push({ kind: 'literal', char: chars[index + 1]! });
      index += 2;
    } else {
      tokens.push({ kind: 'literal', char });
      index++;
    }
  }
  return { kind: 'tokens', tokens };
}

function tokenMatches(token: Token, char: string): boolean {
  switch (token.kind) {
    case 'literal':
      return token.char === char;
    case 'any':
      return true;
    case 'class': {
      const inside = token.ranges.some(([low, high]) => char >= low && char <= high);
      return inside !== token.negated;
    }
    case 'star':
      return false;
  }
}

/** Wildcard match of one path segment; `*` never crosses `/` because segments contain none. */
function segmentMatches(tokens: readonly Token[], name: string): boolean {
  const chars = Array.from(name);
  let t = 0;
  let c = 0;
  let starAt = -1;
  let resumeAt = 0;
  while (c < chars.length) {
    const token = tokens[t];
    if (token !== undefined && token.kind === 'star') {
      starAt = t++;
      resumeAt = c;
    } else if (token !== undefined && tokenMatches(token, chars[c]!)) {
      t++;
      c++;
    } else if (starAt !== -1) {
      t = starAt + 1;
      c = ++resumeAt;
    } else {
      return false;
    }
  }
  while (tokens[t]?.kind === 'star') t++;
  return t === tokens.length;
}

/** `**` matches zero or more segments, except at the end, where it needs at least one. */
function pathMatches(segments: readonly Segment[], parts: readonly string[]): boolean {
  const width = parts.length + 1;
  const memo = new Int8Array((segments.length + 1) * width);
  const match = (p: number, s: number): boolean => {
    if (p === segments.length) return s === parts.length;
    const key = p * width + s;
    if (memo[key] !== 0) return memo[key] === 1;
    const segment = segments[p]!;
    let result: boolean;
    if (segment.kind === 'globstar') {
      if (p === segments.length - 1) {
        result = s < parts.length;
      } else {
        result = false;
        for (let next = s; next <= parts.length && !result; next++) result = match(p + 1, next);
      }
    } else {
      result = s < parts.length && segmentMatches(segment.tokens, parts[s]!) && match(p + 1, s + 1);
    }
    memo[key] = result ? 1 : -1;
    return result;
  };
  return match(0, 0);
}

function parseLine(raw: string): Rule | null {
  let line = trimTrailingSpaces(raw.replace(/\r$/, ''));
  if (line.length === 0 || line.startsWith('#')) return null;
  let negated = false;
  if (line.startsWith('!')) {
    negated = true;
    line = line.slice(1);
  }
  let directoryOnly = false;
  while (line.endsWith('/')) {
    directoryOnly = true;
    line = line.slice(0, -1);
  }
  if (line.length === 0) return null;
  const anchored = line.includes('/');
  if (line.startsWith('/')) line = line.slice(1);
  const segments: Segment[] = [];
  for (const part of line.split('/')) {
    if (part.length === 0) continue;
    const segment = parseSegment(part);
    if (segment.kind === 'globstar' && segments[segments.length - 1]?.kind === 'globstar') continue;
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  return { negated, directoryOnly, anchored, segments };
}

export function parseGitignore(text: string, directory: string): IgnoreRules {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const rules = body
    .split('\n')
    .map(parseLine)
    .filter((rule): rule is Rule => rule !== null);
  return { directory, rules };
}

/** Last matching rule across the stack wins; returns true when the path is ignored. */
export function isIgnored(
  stack: readonly IgnoreRules[],
  path: string,
  isDirectory: boolean,
): boolean {
  let ignored = false;
  for (const { directory, rules } of stack) {
    let relative = path;
    if (directory !== '') {
      if (!path.startsWith(`${directory}/`)) continue;
      relative = path.slice(directory.length + 1);
    }
    const parts = relative.split('/');
    const basename = [parts[parts.length - 1]!];
    for (const rule of rules) {
      if (rule.directoryOnly && !isDirectory) continue;
      if (pathMatches(rule.segments, rule.anchored ? parts : basename)) ignored = !rule.negated;
    }
  }
  return ignored;
}
