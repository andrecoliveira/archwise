/** POSIX path helpers for repository-relative paths ('/'-separated, no leading slash). */

export function normalizePosix(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..' && out.length > 0 && out[out.length - 1] !== '..') out.pop();
    else out.push(segment);
  }
  return out.join('/');
}

export function joinPosix(base: string, path: string): string {
  return base === '' ? path : `${base}/${path}`;
}

export function dirnamePosix(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function basenamePosix(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
