/*
 * A small gitignore matcher: comments, escapes, negation, anchoring, directory-only rules,
 * `*`, `?`, `[...]` and `**`. Runs of `*` and of `**` segments collapse into one token so every
 * compiled expression stays linear in the path length.
 */

interface Rule {
  readonly negated: boolean;
  readonly directoryOnly: boolean;
  /** Matched against the basename when unanchored, else against the base-relative path. */
  readonly anchored: boolean;
  readonly pattern: RegExp;
}

export interface IgnoreRules {
  /** Directory of the .gitignore, relative to the repository root ('' for the root). */
  readonly directory: string;
  readonly rules: readonly Rule[];
}

const GLOBSTAR_PREFIX = '(?:.*/)?';
const escapeLiteral = (char: string): string => char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

function trimTrailingSpaces(line: string): string {
  let end = line.length;
  while (end > 0 && line[end - 1] === ' ' && line[end - 2] !== '\\') end--;
  return line.slice(0, end);
}

/** Converts a bracket expression starting at `start` (the `[`); returns null when unterminated. */
function bracket(glob: string, start: number): { source: string; next: number } | null {
  let index = start + 1;
  let negated = false;
  if (glob[index] === '!' || glob[index] === '^') {
    negated = true;
    index++;
  }
  let body = '';
  let first = true;
  while (index < glob.length && (glob[index] !== ']' || first)) {
    const char = glob[index]!;
    if (char === '\\' && index + 1 < glob.length) {
      body += escapeLiteral(glob[index + 1]!);
      index += 2;
    } else {
      body += char === '-' ? '-' : escapeLiteral(char);
      index++;
    }
    first = false;
  }
  if (index >= glob.length) return null;
  return { source: negated ? `[^/${body}]` : `(?![/])[${body}]`, next: index + 1 };
}

function compile(glob: string): string {
  const tokens: string[] = [];
  const push = (token: string): void => {
    if (token === GLOBSTAR_PREFIX && tokens[tokens.length - 1] === GLOBSTAR_PREFIX) return;
    if (token === '[^/]*' && tokens[tokens.length - 1] === '[^/]*') return;
    tokens.push(token);
  };
  let index = 0;
  while (index < glob.length) {
    const char = glob[index]!;
    if (char === '*') {
      let end = index;
      while (glob[end] === '*') end++;
      const atSegmentStart = index === 0 || glob[index - 1] === '/';
      const atSegmentEnd = end === glob.length || glob[end] === '/';
      if (end - index >= 2 && atSegmentStart && atSegmentEnd) {
        if (end === glob.length) {
          push('.*');
          index = end;
        } else {
          push(GLOBSTAR_PREFIX);
          index = end + 1;
        }
      } else {
        push('[^/]*');
        index = end;
      }
    } else if (char === '?') {
      push('[^/]');
      index++;
    } else if (char === '[') {
      const converted = bracket(glob, index);
      if (converted === null) {
        push('\\[');
        index++;
      } else {
        push(converted.source);
        index = converted.next;
      }
    } else if (char === '\\' && index + 1 < glob.length) {
      push(escapeLiteral(glob[index + 1]!));
      index += 2;
    } else {
      push(escapeLiteral(char));
      index++;
    }
  }
  return tokens.join('');
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
  return { negated, directoryOnly, anchored, pattern: new RegExp(`^${compile(line)}$`, 'u') };
}

export function parseGitignore(text: string, directory: string): IgnoreRules {
  const rules = text
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
    const basename = relative.slice(relative.lastIndexOf('/') + 1);
    for (const rule of rules) {
      if (rule.directoryOnly && !isDirectory) continue;
      if (rule.pattern.test(rule.anchored ? relative : basename)) ignored = !rule.negated;
    }
  }
  return ignored;
}
