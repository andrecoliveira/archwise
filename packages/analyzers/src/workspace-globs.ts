import { normalizePosix } from './paths.js';

function segmentPattern(segment: string): RegExp {
  const escaped = segment.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchSegments(path: readonly string[], glob: readonly string[]): boolean {
  if (glob.length === 0) return path.length === 0;
  const [head, ...rest] = glob;
  if (head === '**') {
    for (let skip = 0; skip <= path.length; skip++) {
      if (matchSegments(path.slice(skip), rest)) return true;
    }
    return false;
  }
  return (
    path.length > 0 && segmentPattern(head!).test(path[0]!) && matchSegments(path.slice(1), rest)
  );
}

/**
 * Workspace membership by package-manager globs: `*` is one segment, `**` any number, a
 * leading `!` excludes, and the last matching pattern wins. `./` and a trailing `/` are ignored.
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
