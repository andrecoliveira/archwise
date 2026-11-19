import { createHash, randomBytes } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  RevisionInvalidError,
  SessionService,
  type DiscoveryInput,
  type SessionSummary,
  type StoredScan,
} from '@archwise/application';
import { openStore, type OpenedStore, type StoreUnavailableReason } from '@archwise/storage';
import type { ArchitectureGraph } from './graph.js';
import { buildGraphRevision, type RevisionScan } from './revision.js';

export type StoreRuntime =
  | { readonly kind: 'disabled'; readonly notices: readonly string[] }
  | {
      readonly kind: 'ready';
      readonly service: SessionService;
      readonly store: OpenedStore;
      readonly notices: readonly string[];
    };

export interface PrepareStoreOptions {
  readonly enabled: boolean;
  readonly dataDir: string;
  readonly rootPath: string;
  /** Repositories, manifest ownership and truncation from the inventory. */
  readonly scan: RevisionScan;
  /** Scan metadata to record with the revision (counts and codes only). */
  readonly scanRecord?: DiscoveryInput['scan'];
  readonly graph: ArchitectureGraph;
}

/**
 * Opens the local store and records this discovery run. Throws `StoreUnavailableError` for
 * newer-schema, failed-migration and unwritable stores; the caller exits with code 2.
 */
/** Resolves symlinks through the nearest existing ancestor, for paths that may not exist yet. */
function canonical(path: string): string {
  let current = resolve(path);
  const missing: string[] = [];
  while (!existsSync(current) && dirname(current) !== current) {
    missing.unshift(current.slice(dirname(current).length + 1));
    current = dirname(current);
  }
  return resolve(realpathSync(current), ...missing);
}

/** True when `child` is `parent` or lies beneath it. */
export function isWithin(child: string, parent: string): boolean {
  const rel = relative(canonical(parent), canonical(child));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export async function prepareStore(options: PrepareStoreOptions): Promise<StoreRuntime> {
  if (!options.enabled) return { kind: 'disabled', notices: [] };
  if (isWithin(options.dataDir, options.rootPath)) {
    return {
      kind: 'disabled',
      notices: [
        'The local store directory is inside the analyzed project; sessions are not saved in this run. Set ARCHWISE_DATA_DIR to a directory outside the project.',
      ],
    };
  }
  const store = await openStore(options.dataDir);
  const notices: string[] = [];
  if (store.quarantinedPath) {
    notices.push(
      `Store file was corrupt; moved to ${store.quarantinedPath}. Started a fresh store.`,
    );
  }
  if (store.backupPath) notices.push(`Store migrated; backup at ${store.backupPath}.`);
  try {
    const opened = SessionService.open(
      {
        store,
        clock: { now: () => new Date().toISOString() },
        ids: { next: (prefix) => `${prefix}-${randomBytes(12).toString('hex')}` },
        digest: { sha256Hex: (text) => createHash('sha256').update(text, 'utf8').digest('hex') },
      },
      {
        rootPath: options.rootPath,
        view: JSON.stringify(options.graph),
        viewIdentity: JSON.stringify({ ...options.graph, inspectedEntries: 0 }),
        build: (ids) => buildGraphRevision(options.graph, options.scan, ids),
        ...(options.scanRecord ? { scan: options.scanRecord } : {}),
      },
    );
    if (!opened.ok) throw new Error(opened.error);
    return { kind: 'ready', service: opened.value, store, notices };
  } catch (error) {
    store.close();
    if (error instanceof RevisionInvalidError) {
      return {
        kind: 'disabled',
        notices: [
          ...notices,
          'The discovered graph could not be recorded as a revision; sessions are not saved in this run.',
        ],
      };
    }
    throw error;
  }
}

/** Resolves `latest` or a session ID to a stored session of this workspace, or null. */
export function resumeTarget(service: SessionService, value: string): string | null {
  if (value === 'latest') return service.list()[0]?.id ?? null;
  return service.get(value).ok ? value : null;
}

/**
 * Makes the requested session current before serving. Returns an actionable error message
 * when it cannot, in which case the caller exits with code 2 without starting a server.
 */
export function applyResume(runtime: StoreRuntime, value: string): string | null {
  if (runtime.kind !== 'ready') {
    return 'The local store is unavailable in this run, so no session can be resumed.';
  }
  const target = resumeTarget(runtime.service, value);
  if (target === null) return `No saved session matches "${value}". Run --sessions to list them.`;
  runtime.service.resume(target);
  return null;
}

export function storeUnavailableMessage(reason: StoreUnavailableReason, dataDir: string): string {
  switch (reason) {
    case 'newer-schema':
      return `The local store in ${dataDir} was written by a newer Archwise. Upgrade Archwise, or run with --no-store.`;
    case 'migration-failed':
      return `Upgrading the local store in ${dataDir} failed; the file was left unchanged. Please report a bug, and run with --no-store meanwhile.`;
    case 'unwritable':
      return `The local store directory ${dataDir} is not writable. Fix its permissions, or set ARCHWISE_DATA_DIR to a writable directory.`;
  }
}

export function formatSessionList(
  sessions: readonly SessionSummary[],
  lastScan: StoredScan | null = null,
): string {
  const footer = lastScan === null ? '' : `Last scan: ${lastScan.finishedAt}\n`;
  if (sessions.length === 0) return `No saved sessions for this project.\n${footer}`;
  return sessions
    .map((session) => {
      const flags = [session.hasSnapshots ? 'A/B' : '', session.baseIsCurrent ? '' : 'changed']
        .filter(Boolean)
        .join(' ');
      const count = `${session.componentCount} component${session.componentCount === 1 ? '' : 's'}`;
      return [session.updatedAt, session.label, count, flags, session.id]
        .filter(Boolean)
        .join('  ');
    })
    .join('\n')
    .concat('\n', footer);
}
