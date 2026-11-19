import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import {
  DEFAULT_BUDGETS,
  InventoryRootError,
  type BudgetName,
  type InventoryBudgets,
  type InventoryManifest,
  type InventoryRepository,
  type InventoryRequest,
  type InventoryResult,
  type SkipReason,
  type SkipSummary,
} from '@archwise/application';
import { LIMITS, checkRelativePath, compareCodeUnits, redactSensitiveText } from '@archwise/domain';
import { isIgnored, parseGitignore, type IgnoreRules } from './gitignore.js';
import { parseManifest } from './manifest.js';

export const BUILTIN_EXCLUSIONS: ReadonlySet<string> = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.venv',
  'vendor',
  '.cache',
  '.output',
  'target',
  '__pycache__',
]);

const MAX_EXAMPLES = 20;
const PROGRESS_INTERVAL = 250;
const MANIFEST = 'package.json';
const GITIGNORE = '.gitignore';

class Truncated extends Error {}

const code = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code;

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function labelOf(name: string, knownHomes: readonly string[], fallback: string): string {
  const redacted = redactSensitiveText(name, knownHomes);
  const trimmed = Array.from(redacted).slice(0, LIMITS.label).join('');
  return trimmed.length > 0 ? trimmed : fallback;
}

async function resolveRoot(input: string): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(input));
  } catch (error) {
    throw new InventoryRootError(code(error) === 'ENOENT' ? 'not-found' : 'unreadable');
  }
  if (!(await lstat(root)).isDirectory()) throw new InventoryRootError('not-directory');
  return root;
}

async function resolvedHomes(homes: readonly string[]): Promise<string[]> {
  const all = new Set<string>();
  for (const home of homes) {
    all.add(home);
    all.add(await realpath(home).catch(() => home));
  }
  return [...all];
}

interface Frame {
  readonly repository: InventoryRepository;
  /** Path of the current directory relative to its repository root. */
  readonly repoPath: string;
  readonly ignores: readonly IgnoreRules[];
}

/** Lists a single user root safely. Never executes, follows links out of the root, or writes. */
export async function walkWorkspace(request: InventoryRequest): Promise<InventoryResult> {
  const budgets: InventoryBudgets = { ...DEFAULT_BUDGETS, ...request.budgets };
  const now = request.now ?? (() => performance.now());
  const signal = request.signal;
  signal?.throwIfAborted();
  const started = now();
  const root = await resolveRoot(request.root);
  const homes = await resolvedHomes(request.knownHomes);

  const repositories: InventoryRepository[] = [];
  const manifests: InventoryManifest[] = [];
  const diagnostics = new Set<string>();
  const skips = new Map<SkipReason, { count: number; examples: string[] }>();
  let listedEntries = 0;
  let bytesRead = 0;
  let truncated: BudgetName | null = null;
  let depthReached = false;

  const skip = (reason: SkipReason, path: string): void => {
    const entry = skips.get(reason) ?? { count: 0, examples: [] };
    entry.count += 1;
    entry.examples.push(path);
    skips.set(reason, entry);
  };
  const stop = (budget: BudgetName): never => {
    truncated ??= budget;
    throw new Truncated();
  };
  const checkClock = (): void => {
    signal?.throwIfAborted();
    if (now() - started > budgets.timeMs) stop('time');
  };
  const readBounded = async (absolute: string, size: number): Promise<Buffer> => {
    checkClock();
    if (bytesRead + size > budgets.bytesTotal) stop('bytes-total');
    const bytes = await readFile(absolute);
    bytesRead += bytes.byteLength;
    return bytes;
  };

  const rootRepository: InventoryRepository = {
    id: 'repo-root',
    label: homes.includes(root) ? 'home' : labelOf(basename(root), homes, 'workspace'),
    path: '',
    nested: false,
  };
  repositories.push(rootRepository);

  const visit = async (absolute: string, rootPath: string, depth: number, frame: Frame) => {
    checkClock();
    let entries: Dirent[];
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      if (rootPath === '') throw new InventoryRootError('unreadable');
      skip('unreadable', rootPath);
      diagnostics.add(`Unreadable directory: ${rootPath}`);
      return;
    }
    entries.sort((a, b) => compareCodeUnits(a.name, b.name));
    const join2 = (base: string, name: string) => (base === '' ? name : `${base}/${name}`);

    let ignores = frame.ignores;
    const ignoreFile = entries.find((entry) => entry.name === GITIGNORE && entry.isFile());
    if (ignoreFile) {
      const ignorePath = join2(rootPath, GITIGNORE);
      try {
        const path = join(absolute, GITIGNORE);
        const size = (await lstat(path)).size;
        if (size > budgets.bytesPerFile) {
          skip('too-large', ignorePath);
          diagnostics.add(`Ignore file exceeds size limit: ${ignorePath}`);
        } else {
          const text = (await readBounded(path, size)).toString('utf8');
          ignores = [...ignores, parseGitignore(text, frame.repoPath)];
        }
      } catch (error) {
        if (error instanceof Truncated) {
          for (const entry of entries) skip('budget-exhausted', join2(rootPath, entry.name));
          throw error;
        }
        if ((error as Error).name === 'AbortError') throw error;
        diagnostics.add(`Unreadable ignore file: ${ignorePath}`);
      }
    }

    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!;
      const childRoot = join2(rootPath, entry.name);
      const childRepo = join2(frame.repoPath, entry.name);
      const childAbsolute = join(absolute, entry.name);
      // A directory that was entered accounts for its own remaining entries when truncated.
      let entered = false;
      try {
        if (truncated !== null) throw new Truncated();
        if (listedEntries >= budgets.entries) stop('entries');
        listedEntries += 1;
        if (listedEntries % PROGRESS_INTERVAL === 0) {
          request.onProgress?.(listedEntries);
          signal?.throwIfAborted();
        }
        if (checkRelativePath(childRoot) !== null) {
          skip('unsupported-name', childRoot);
          continue;
        }
        if (BUILTIN_EXCLUSIONS.has(entry.name)) {
          skip('ignored-builtin', childRoot);
          continue;
        }
        if (isIgnored(ignores, childRepo, entry.isDirectory())) {
          skip('ignored-gitignore', childRoot);
          continue;
        }
        if (entry.isSymbolicLink()) {
          const target = await realpath(childAbsolute).catch(() => null);
          skip(target !== null && isWithin(root, target) ? 'symlink' : 'outside-root', childRoot);
          continue;
        }
        const stats = entry.isDirectory() || entry.isFile() ? null : await lstat(childAbsolute);
        if (entry.isDirectory() || stats?.isDirectory()) {
          if (depth + 1 > budgets.depth) {
            // Depth truncates without stopping: shallower directories are still scanned.
            depthReached = true;
            skip('too-deep', childRoot);
            continue;
          }
          const marker = await lstat(join(childAbsolute, '.git')).catch(() => null);
          if (marker !== null && (marker.isDirectory() || marker.isFile())) {
            skip('nested-repository', childRoot);
            const repository: InventoryRepository = {
              id: `repo-${createHash('sha256').update(childRoot).digest('hex').slice(0, 16)}`,
              label: labelOf(entry.name, homes, 'repository'),
              path: childRoot,
              nested: true,
            };
            repositories.push(repository);
            entered = true;
            await visit(childAbsolute, childRoot, depth + 1, {
              repository,
              repoPath: '',
              ignores: [],
            });
          } else {
            entered = true;
            await visit(childAbsolute, childRoot, depth + 1, {
              ...frame,
              repoPath: childRepo,
              ignores,
            });
          }
          continue;
        }
        if (entry.isFile() || stats?.isFile()) {
          if (entry.name !== MANIFEST) continue;
          const size = (await lstat(childAbsolute)).size;
          if (size > budgets.bytesPerFile) {
            skip('too-large', childRoot);
            diagnostics.add(`Manifest exceeds size limit: ${childRoot}`);
            continue;
          }
          let bytes: Buffer;
          try {
            bytes = await readBounded(childAbsolute, size);
          } catch (error) {
            if (error instanceof Truncated || (error as Error).name === 'AbortError') throw error;
            skip('unreadable', childRoot);
            continue;
          }
          const outcome = parseManifest(bytes, childRoot, homes);
          if (outcome.kind === 'binary') skip('binary', childRoot);
          else if (outcome.kind === 'invalid') {
            skip('unreadable', childRoot);
            diagnostics.add(`Invalid or unreadable manifest: ${childRoot}`);
          } else {
            manifests.push({
              repositoryId: frame.repository.id,
              path: childRoot,
              ...outcome.manifest,
            });
          }
          continue;
        }
        skip('special-file', childRoot);
      } catch (error) {
        if (!(error instanceof Truncated)) {
          // An entry that vanished or cannot be stat-ed is skipped; the scan goes on.
          if ((error as Error).name === 'AbortError' || entered) throw error;
          skip('unreadable', childRoot);
          continue;
        }
        for (const rest of entries.slice(entered ? index + 1 : index))
          skip('budget-exhausted', join2(rootPath, rest.name));
        throw error;
      }
    }
  };

  try {
    await visit(root, '', 0, { repository: rootRepository, repoPath: '', ignores: [] });
  } catch (error) {
    if (!(error instanceof Truncated)) throw error;
  }

  const skipped: Partial<Record<SkipReason, SkipSummary>> = {};
  for (const [reason, entry] of [...skips].sort(([a], [b]) => compareCodeUnits(a, b))) {
    skipped[reason] = {
      count: entry.count,
      examples: [...entry.examples].sort(compareCodeUnits).slice(0, MAX_EXAMPLES),
    };
  }
  return {
    version: 2,
    root,
    repositories: repositories.sort((a, b) => compareCodeUnits(a.path, b.path)),
    manifests: manifests.sort((a, b) => compareCodeUnits(a.path, b.path)),
    listedEntries,
    bytesRead,
    skipped,
    truncated: truncated ?? (depthReached ? 'depth' : null),
    diagnostics: [...diagnostics].sort(compareCodeUnits),
    durationMs: Math.max(0, now() - started),
  };
}
