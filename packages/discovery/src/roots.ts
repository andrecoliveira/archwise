import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import * as nodePath from 'node:path';
import { InventoryRootError, type RootRequest } from '@archwise/application';
import { LIMITS, compareCodeUnits, redactSensitiveText } from '@archwise/domain';

/** A user root after resolution. `absolute` stays in the process; it is never serialized. */
export interface ResolvedRoot {
  readonly id: string;
  readonly label: string;
  /** Canonical absolute path. */
  readonly absolute: string;
  /** Path from the workspace's common ancestor; hash input for repository IDs ('' when single). */
  readonly idBase: string;
  /** Index of the first request that named this root. */
  readonly requestIndex: number;
}

export const ROOT_REPOSITORY_ID = 'repo-root';

const code = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code;

const truncate = (text: string, max: number): string => Array.from(text).slice(0, max).join('');

export const repositoryId = (idBase: string): string =>
  `repo-${createHash('sha256').update(idBase).digest('hex').slice(0, 16)}`;

/** A redacted, length-limited label; `fallback` when nothing printable remains. */
export function labelOf(name: string, knownHomes: readonly string[], fallback: string): string {
  const trimmed = truncate(redactSensitiveText(name, knownHomes), LIMITS.label);
  return trimmed.length > 0 ? trimmed : fallback;
}

/** Canonical directory for one requested root, or an `InventoryRootError` naming its index. */
export async function resolveRoot(input: string, index = 0): Promise<string> {
  let root: string;
  try {
    root = await realpath(nodePath.resolve(input));
  } catch (error) {
    throw new InventoryRootError(code(error) === 'ENOENT' ? 'not-found' : 'unreadable', index);
  }
  if (!(await lstat(root)).isDirectory()) throw new InventoryRootError('not-directory', index);
  return root;
}

/** The given home directories plus their canonical forms. */
export async function resolvedHomes(homes: readonly string[]): Promise<string[]> {
  const all = new Set<string>();
  for (const home of homes) {
    all.add(home);
    all.add(await realpath(home).catch(() => home));
  }
  return [...all];
}

function segmentsOf(path: string, pathApi: typeof nodePath.posix): string[] {
  const parts = pathApi
    .normalize(path)
    .split(pathApi.sep)
    .filter((part) => part.length > 0);
  // A Windows drive (`C:`) compares case-insensitively and is written as `c`.
  if (pathApi.sep === '\\' && parts[0]?.endsWith(':'))
    parts[0] = parts[0].slice(0, -1).toLowerCase();
  return parts;
}

/**
 * Each root's path from the roots' common ancestor, `/`-separated. Without a common ancestor
 * (Windows roots on different drives), the full path with the drive letter is used.
 */
export function rootIdBases(
  roots: readonly string[],
  pathApi: typeof nodePath.posix = nodePath,
): string[] {
  const split = roots.map((root) => segmentsOf(root, pathApi));
  let common = 0;
  const shortest = Math.min(...split.map((parts) => parts.length));
  while (common < shortest && split.every((parts) => parts[common] === split[0]![common])) {
    common++;
  }
  return split.map((parts) => parts.slice(common).join('/'));
}

/**
 * Makes labels unique: a duplicate that is not pinned is prefixed with its parent directory
 * name; any duplicate left gets ` #2`, ` #3`… in input order. Labels stay within the limit.
 */
export function makeLabelsUnique(
  items: readonly { readonly label: string; readonly parent: string; readonly pinned?: boolean }[],
): string[] {
  const counts = new Map<string, number>();
  for (const { label } of items) counts.set(label, (counts.get(label) ?? 0) + 1);
  const prefixed = items.map(({ label, parent, pinned }) =>
    counts.get(label)! > 1 && !pinned && parent.length > 0
      ? truncate(`${parent}/${label}`, LIMITS.label)
      : label,
  );
  const seen = new Map<string, number>();
  const taken = new Set(prefixed);
  return prefixed.map((label) => {
    const occurrence = (seen.get(label) ?? 0) + 1;
    seen.set(label, occurrence);
    if (occurrence === 1) return label;
    for (let n = occurrence; ; n++) {
      const suffix = ` #${n}`;
      const candidate = `${truncate(label, LIMITS.label - suffix.length)}${suffix}`;
      if (!taken.has(candidate)) {
        taken.add(candidate);
        return candidate;
      }
    }
  });
}

/**
 * Resolves user roots: canonical paths, duplicates merged (the first request wins), stable IDs
 * and unique labels. One root keeps `repo-root`. The result is sorted by ID, the scan order.
 */
export async function resolveRoots(
  requests: readonly RootRequest[],
  knownHomes: readonly string[],
): Promise<ResolvedRoot[]> {
  const homes = await resolvedHomes(knownHomes);
  const unique: { absolute: string; request: RootRequest; index: number }[] = [];
  const seen = new Set<string>();
  for (const [index, request] of requests.entries()) {
    const absolute = await resolveRoot(request.path, index);
    const key = process.platform === 'darwin' ? absolute.normalize('NFC') : absolute;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ absolute, request, index });
  }
  const bases = unique.length === 1 ? [''] : rootIdBases(unique.map((u) => u.absolute));
  const labels = makeLabelsUnique(
    unique.map(({ absolute, request }) => ({
      label:
        request.label ??
        (homes.includes(absolute)
          ? 'home'
          : labelOf(nodePath.basename(absolute), homes, 'workspace')),
      parent: labelOf(nodePath.basename(nodePath.dirname(absolute)), homes, ''),
    })),
  );
  return unique
    .map(({ absolute, index: requestIndex }, index) => ({
      id: unique.length === 1 ? ROOT_REPOSITORY_ID : repositoryId(bases[index]!),
      label: labels[index]!,
      absolute,
      idBase: bases[index]!,
      requestIndex,
    }))
    .sort((a, b) => compareCodeUnits(a.id, b.id));
}
