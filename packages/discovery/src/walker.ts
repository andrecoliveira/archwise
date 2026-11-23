import type { Dirent } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import {
  DEFAULT_BUDGETS,
  InventoryRootError,
  type BudgetName,
  type InventoryBudgets,
  type InventoryFile,
  type InventoryManifest,
  type InventoryRepository,
  type InventoryRequest,
  type InventoryResult,
  type SkipReason,
  type SkipSummary,
} from '@archwise/application';
import { checkRelativePath, compareCodeUnits } from '@archwise/domain';
import { isIgnored, parseGitignore, type IgnoreRules } from './gitignore.js';
import { isDeniedInput } from './deny-list.js';
import { looksBinary, parseManifest } from './manifest.js';
import {
  labelOf,
  makeLabelsUnique,
  repositoryId,
  resolveRoots,
  resolvedHomes,
  type ResolvedRoot,
} from './roots.js';

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

function isWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** A repository while it is being scanned; counts are filled in as entries are listed. */
interface RepositoryState {
  readonly id: string;
  label: string;
  readonly rootId: string;
  readonly path: string;
  readonly nested: boolean;
  reached: boolean;
  listedEntries: number;
  manifests: number;
  readonly skipped: Map<SkipReason, number>;
}

interface Frame {
  readonly root: ResolvedRoot;
  readonly repository: RepositoryState;
  /** Path of the current directory relative to its repository root. */
  readonly repoPath: string;
  readonly ignores: readonly IgnoreRules[];
}

const join2 = (base: string, name: string): string => (base === '' ? name : `${base}/${name}`);

/**
 * Lists user roots safely, in ID order, with workspace-wide budgets. Never executes, follows
 * links, or writes. Another user root inside a root is skipped there and scanned on its own.
 */
export async function walkWorkspace(request: InventoryRequest): Promise<InventoryResult> {
  const budgets: InventoryBudgets = { ...DEFAULT_BUDGETS, ...request.budgets };
  const now = request.now ?? (() => performance.now());
  const signal = request.signal;
  signal?.throwIfAborted();
  const started = now();
  const roots = await resolveRoots(request.roots, request.knownHomes);
  const homes = await resolvedHomes(request.knownHomes);
  const multiRoot = roots.length > 1;
  const userRoots = new Set(roots.map((root) => root.absolute));

  const repositories: RepositoryState[] = [];
  const manifests: InventoryManifest[] = [];
  const files: InventoryFile[] = [];
  const inputNames = new Set(request.inputs?.fileNames ?? []);
  const inputExtensions = request.inputs?.extensions ?? [];
  /** A declared analyzer input that is not a manifest and not on the deny list. */
  const isInput = (name: string, path: string): boolean =>
    name !== MANIFEST &&
    (inputNames.has(name) || inputExtensions.some((extension) => name.endsWith(extension))) &&
    !isDeniedInput(path);
  const diagnostics = new Set<string>();
  const skips = new Map<SkipReason, { count: number; examples: string[] }>();
  let listedEntries = 0;
  let bytesRead = 0;
  let truncated: BudgetName | null = null;
  let depthReached = false;

  const newRepository = (
    fields: Pick<RepositoryState, 'id' | 'label' | 'rootId' | 'path' | 'nested'>,
  ): RepositoryState => {
    const state: RepositoryState = {
      ...fields,
      reached: false,
      listedEntries: 0,
      manifests: 0,
      skipped: new Map(),
    };
    repositories.push(state);
    return state;
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
  const progress = (repository: string): void =>
    request.onProgress?.({ listedEntries, repository, elapsedMs: Math.max(0, now() - started) });

  const visit = async (absolute: string, rootPath: string, depth: number, frame: Frame) => {
    checkClock();
    /** Multi-root output names the user root first, so equal relative paths stay distinct. */
    const shown = (path: string): string => (multiRoot ? `${frame.root.label}/${path}` : path);
    const skip = (reason: SkipReason, path: string): void => {
      const entry = skips.get(reason) ?? { count: 0, examples: [] };
      entry.count += 1;
      entry.examples.push(shown(path));
      skips.set(reason, entry);
      const counts = frame.repository.skipped;
      counts.set(reason, (counts.get(reason) ?? 0) + 1);
    };
    let entries: Dirent[];
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      if (rootPath === '') throw new InventoryRootError('unreadable', frame.root.requestIndex);
      skip('unreadable', rootPath);
      diagnostics.add(`Unreadable directory: ${shown(rootPath)}`);
      return;
    }
    entries.sort((a, b) => compareCodeUnits(a.name, b.name));

    let ignores = frame.ignores;
    const ignoreFile = entries.find((entry) => entry.name === GITIGNORE && entry.isFile());
    if (ignoreFile) {
      const ignorePath = join2(rootPath, GITIGNORE);
      try {
        const path = join(absolute, GITIGNORE);
        const size = (await lstat(path)).size;
        if (size > budgets.bytesPerFile) {
          skip('too-large', ignorePath);
          diagnostics.add(`Ignore file exceeds size limit: ${shown(ignorePath)}`);
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
        diagnostics.add(`Unreadable ignore file: ${shown(ignorePath)}`);
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
        frame.repository.listedEntries += 1;
        if (listedEntries % PROGRESS_INTERVAL === 0) {
          progress(frame.repository.label);
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
          skip(
            target !== null && isWithin(frame.root.absolute, target) ? 'symlink' : 'outside-root',
            childRoot,
          );
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
          if (userRoots.has(childAbsolute)) {
            // Another user root: scanned on its own, never twice.
            skip('nested-repository', childRoot);
            continue;
          }
          const marker = await lstat(join(childAbsolute, '.git')).catch(() => null);
          if (marker !== null && (marker.isDirectory() || marker.isFile())) {
            skip('nested-repository', childRoot);
            const repository = newRepository({
              id: repositoryId(join2(frame.root.idBase, childRoot)),
              label: labelOf(entry.name, homes, 'repository'),
              rootId: frame.root.id,
              path: childRoot,
              nested: true,
            });
            repository.reached = true;
            entered = true;
            await visit(childAbsolute, childRoot, depth + 1, {
              root: frame.root,
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
          if (isInput(entry.name, childRoot)) {
            const owner = { repositoryId: frame.repository.id, rootId: frame.root.id };
            const size = (await lstat(childAbsolute)).size;
            if (size > budgets.bytesPerFile) {
              skip('too-large', childRoot);
              files.push({ ...owner, path: childRoot, text: null, problem: 'too-large' });
              continue;
            }
            let bytes: Buffer;
            try {
              bytes = await readBounded(childAbsolute, size);
            } catch (error) {
              if (error instanceof Truncated || (error as Error).name === 'AbortError') throw error;
              skip('unreadable', childRoot);
              files.push({ ...owner, path: childRoot, text: null, problem: 'unreadable' });
              continue;
            }
            if (looksBinary(bytes)) {
              skip('binary', childRoot);
              files.push({ ...owner, path: childRoot, text: null, problem: 'binary' });
            } else {
              files.push({
                ...owner,
                path: childRoot,
                text: bytes.toString('utf8'),
                problem: null,
              });
            }
            continue;
          }
          if (entry.name !== MANIFEST) continue;
          const size = (await lstat(childAbsolute)).size;
          if (size > budgets.bytesPerFile) {
            skip('too-large', childRoot);
            diagnostics.add(`Manifest exceeds size limit: ${shown(childRoot)}`);
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
            diagnostics.add(`Invalid or unreadable manifest: ${shown(childRoot)}`);
          } else {
            frame.repository.manifests += 1;
            manifests.push({
              repositoryId: frame.repository.id,
              rootId: frame.root.id,
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

  for (const root of roots) {
    const repository = newRepository({
      id: root.id,
      label: root.label,
      rootId: root.id,
      path: '',
      nested: false,
    });
    if (truncated !== null) continue;
    progress(root.label);
    let completed = false;
    try {
      await visit(root.absolute, '', 0, { root, repository, repoPath: '', ignores: [] });
      completed = true;
    } catch (error) {
      if (!(error instanceof Truncated)) throw error;
    }
    // A root counts as scanned once it listed something, or finished (an empty root).
    repository.reached = completed || repository.listedEntries > 0;
  }
  for (const repository of repositories) {
    if (!repository.reached) {
      diagnostics.add(`Repository not scanned: ${repository.label}. A budget ran out first.`);
    }
  }

  const labels = makeLabelsUnique(
    repositories.map((repository) => {
      const parts = repository.path.split('/');
      const rootLabel = repositories.find((r) => r.id === repository.rootId)?.label ?? '';
      return {
        label: repository.label,
        parent: parts.length > 1 ? parts[parts.length - 2]! : rootLabel,
        pinned: !repository.nested,
      };
    }),
  );
  repositories.forEach((repository, index) => (repository.label = labels[index]!));

  const skipped: Partial<Record<SkipReason, SkipSummary>> = {};
  for (const [reason, entry] of [...skips].sort(([a], [b]) => compareCodeUnits(a, b))) {
    skipped[reason] = {
      count: entry.count,
      examples: [...entry.examples].sort(compareCodeUnits).slice(0, MAX_EXAMPLES),
    };
  }
  const byRootThenPath = (
    a: { rootId: string; path: string },
    b: { rootId: string; path: string },
  ): number => compareCodeUnits(a.rootId, b.rootId) || compareCodeUnits(a.path, b.path);
  return {
    version: 2,
    roots: roots.map((root) => root.absolute),
    repositories: repositories
      .map((state): InventoryRepository => ({
        id: state.id,
        label: state.label,
        rootId: state.rootId,
        path: state.path,
        nested: state.nested,
        reached: state.reached,
        listedEntries: state.listedEntries,
        manifests: state.manifests,
        skipped: Object.fromEntries([...state.skipped].sort(([a], [b]) => compareCodeUnits(a, b))),
      }))
      .sort(byRootThenPath),
    manifests: manifests.sort(byRootThenPath),
    files: files.sort(byRootThenPath),
    listedEntries,
    bytesRead,
    skipped,
    truncated: truncated ?? (depthReached ? 'depth' : null),
    diagnostics: [...diagnostics].sort(compareCodeUnits),
    durationMs: Math.max(0, now() - started),
  };
}
