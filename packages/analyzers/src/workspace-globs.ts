import { normalizePosix } from './paths.js';

/**
 * `*` within one path segment, by dynamic programming over (name, pattern) positions:
 * O(name × pattern), no regular expressions. Patterns come from analyzed repositories.
 */
function matchSegment(name: string, pattern: string): boolean {
  let row = new Array<boolean>(pattern.length + 1).fill(false);
  row[0] = true;
  for (let j = 1; j <= pattern.length; j++) row[j] = row[j - 1]! && pattern[j - 1] === '*';
  for (let i = 1; i <= name.length; i++) {
    const next = new Array<boolean>(pattern.length + 1).fill(false);
    for (let j = 1; j <= pattern.length; j++) {
      const p = pattern[j - 1];
      next[j] = p === '*' ? next[j - 1]! || row[j]! : row[j - 1]! && p === name[i - 1];
    }
    row = next;
  }
  return row[pattern.length]!;
}

/** `**` across segments, by the same dynamic programming over (path, glob) segment positions. */
function matchSegments(path: readonly string[], glob: readonly string[]): boolean {
  let row = new Array<boolean>(glob.length + 1).fill(false);
  row[0] = true;
  for (let j = 1; j <= glob.length; j++) row[j] = row[j - 1]! && glob[j - 1] === '**';
  for (let i = 1; i <= path.length; i++) {
    const next = new Array<boolean>(glob.length + 1).fill(false);
    for (let j = 1; j <= glob.length; j++) {
      const g = glob[j - 1]!;
      next[j] = g === '**' ? next[j - 1]! || row[j]! : row[j - 1]! && matchSegment(path[i - 1]!, g);
    }
    row = next;
  }
  return row[glob.length]!;
}

/**
 * Workspace membership by package-manager globs: `*` is one segment, `**` any number, a
 * leading `!` excludes, and the last matching pattern wins. `./` and a trailing `/` are ignored.
 * Matching is polynomial in the input sizes, so hostile patterns cannot stall a scan.
 */
export function matchesWorkspaceGlob(directory: string, patterns: readonly string[]): boolean {
  const path = normalizePosix(directory).split('/').filter(Boolean);
  let member = false;
  for (const raw of patterns) {
    const negated = raw.startsWith('!');
    const glob = normalizePosix(negated ? raw.slice(1) : raw)
      .split('/')
      .filter(Boolean);
    if (glob.length > 0 && matchSegments(path, glob)) member = !negated;
  }
  return member;
}
