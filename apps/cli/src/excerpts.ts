import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { InventoryResult } from '@archwise/application';
import { isDeniedInput } from '@archwise/discovery';
import { compareCodeUnits, maskConfigLines } from '@archwise/domain';
import type { ArchitectureGraph, ViewEvidence } from './graph.js';

/*
 * Evidence excerpts (spec §5.11, ADR 0008): a bounded, masked, read-only view of the lines an
 * evidence item cites. The server only reads files the latest scan already read, keyed by an
 * opaque identifier; it never takes a path from the browser, and it keeps nothing.
 */

export const EXCERPT_MAX_LINES = 40;
/** A minified file is one huge line; each line shows at most this many characters. */
export const EXCERPT_MAX_LINE_CHARS = 400;

export interface ExcerptEntry {
  /** Canonical absolute user root. */
  readonly root: string;
  /** Root-relative, '/'-separated. */
  readonly path: string;
  readonly lines: { readonly start: number; readonly end: number } | null;
  /** sha256 of the file as the scan read it. */
  readonly sha256: string;
}

export type ExcerptResult =
  | {
      readonly status: 'ok';
      readonly path: string;
      readonly start: number;
      readonly end: number;
      readonly lines: readonly string[];
    }
  | { readonly status: 'changed' }
  | {
      readonly status: 'unavailable';
      readonly reason:
        'denied' | 'outside-root' | 'too-long' | 'too-large' | 'not-utf8' | 'unreadable';
    };

export interface ExcerptIndex {
  /**
   * A copy of the graph whose evidence items carry `excerptId` where an excerpt can be read.
   * Only ids of the graph the index was built from exist; another graph only reuses them.
   */
  decorate(graph: ArchitectureGraph): ArchitectureGraph;
  lookup(id: string): ExcerptEntry | undefined;
}

const sha256 = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

function idOf(root: string, item: ViewEvidence): string {
  return sha256(
    `${root}\0${item.path}\0${item.kind}\0${item.lines?.start ?? ''}-${item.lines?.end ?? ''}`,
  );
}

/** Indexes the evidence of the latest scan. Deterministic; holds hashes, never file contents. */
export function buildExcerptIndex(
  graph: ArchitectureGraph,
  inventory: InventoryResult,
): ExcerptIndex {
  const rootIds = [...new Set(inventory.repositories.map((r) => r.rootId))].sort(compareCodeUnits);
  const rootOf = new Map(rootIds.map((id, index) => [id, inventory.roots[index]]));
  const repositoryRoot = new Map(inventory.repositories.map((r) => [r.id, rootOf.get(r.rootId)]));
  /** Scan-time hashes per root: root → path → sha256. */
  const hashes = new Map<string, Map<string, string>>();
  const remember = (rootId: string, path: string, hash: string): void => {
    const root = rootOf.get(rootId);
    if (root === undefined) return;
    const files = hashes.get(root) ?? new Map<string, string>();
    files.set(path, hash);
    hashes.set(root, files);
  };
  for (const manifest of inventory.manifests)
    remember(manifest.rootId, manifest.path, manifest.sha256);
  for (const file of inventory.files) {
    if (file.text !== null) remember(file.rootId, file.path, sha256(file.text));
  }
  const single = inventory.roots.length === 1 ? inventory.roots[0] : undefined;
  const nodeRoot = new Map<string, string | undefined>(
    graph.nodes.map((node) => [
      node.id,
      single ?? (node.repository ? repositoryRoot.get(node.repository.id) : undefined),
    ]),
  );
  const entries = new Map<string, ExcerptEntry>();

  const locate = (hint: string | undefined, item: ViewEvidence): string | undefined => {
    if (hint !== undefined) return hashes.get(hint)?.has(item.path) ? hint : undefined;
    const holders = [...hashes].filter(([, files]) => files.has(item.path));
    return holders.length === 1 ? holders[0]![0] : undefined;
  };
  // Building registers the scan graph's evidence; afterwards decorating only looks ids up.
  let building = true;
  const decorateItem = (hint: string | undefined, item: ViewEvidence): ViewEvidence => {
    const root = locate(hint, item);
    if (root === undefined) return item;
    const id = idOf(root, item);
    if (building) {
      entries.set(id, {
        root,
        path: item.path,
        lines: item.lines,
        sha256: hashes.get(root)!.get(item.path)!,
      });
    } else if (!entries.has(id)) {
      return item;
    }
    return { ...item, excerptId: id };
  };
  const decorate = (target: ArchitectureGraph): ArchitectureGraph => ({
    ...target,
    nodes: target.nodes.map((node) => {
      const hint = nodeRoot.get(node.id);
      return {
        ...node,
        evidence: node.evidence.map((item) => decorateItem(hint, item)),
        ...(node.properties
          ? {
              properties: node.properties.map((property) => ({
                ...property,
                evidence: decorateItem(hint, property.evidence),
              })),
            }
          : {}),
      };
    }),
    edges: target.edges.map((edge) => {
      const hint = nodeRoot.get(edge.source);
      return { ...edge, evidence: edge.evidence.map((item) => decorateItem(hint, item)) };
    }),
  });
  decorate(graph);
  building = false;
  return { decorate, lookup: (id) => entries.get(id) };
}

const unavailable = (reason: Extract<ExcerptResult, { status: 'unavailable' }>['reason']) =>
  ({ status: 'unavailable', reason }) as const;

/** Reads, checks and masks one excerpt. Never caches and never logs. */
export async function readExcerpt(
  entry: ExcerptEntry,
  limits: { readonly bytesPerFile: number },
): Promise<ExcerptResult> {
  const segments = entry.path.split('/');
  if (
    entry.path === '' ||
    entry.path.startsWith('/') ||
    /^[A-Za-z]:/.test(entry.path) ||
    entry.path.includes('\\') ||
    segments.some((segment) => segment === '' || segment === '.' || segment === '..')
  ) {
    return unavailable('outside-root');
  }
  if (isDeniedInput(entry.path)) return unavailable('denied');
  if (entry.lines !== null && entry.lines.end - entry.lines.start + 1 > EXCERPT_MAX_LINES) {
    return unavailable('too-long');
  }
  let bytes: Buffer;
  try {
    let current = entry.root;
    for (const [index, segment] of segments.entries()) {
      current = join(current, segment);
      const info = await lstat(current);
      if (info.isSymbolicLink()) return unavailable('outside-root');
      if (index === segments.length - 1) {
        if (!info.isFile()) return unavailable('unreadable');
        if (info.size > limits.bytesPerFile) return unavailable('too-large');
      }
    }
    bytes = await readFile(current);
  } catch {
    return unavailable('unreadable');
  }
  if (bytes.length > limits.bytesPerFile) return unavailable('too-large');
  // Decode first: the scan hashed invalid UTF-8 as lossy text, which would read as "changed".
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return unavailable('not-utf8');
  }
  if (sha256(bytes) !== entry.sha256) return { status: 'changed' };
  const all = text.replace(/(?:\r\n|\r|\n)$/, '').split(/\r\n|\r|\n/);
  const start = entry.lines?.start ?? 1;
  const end = entry.lines?.end ?? Math.min(all.length, EXCERPT_MAX_LINES);
  if (start > all.length) return { status: 'changed' };
  // Mask from the top of the file, so a secret block scalar that starts above the range is known.
  const masked = maskConfigLines(all.slice(0, Math.min(end, all.length)));
  // Mask whole lines first, then cut long ones, so a cut never exposes part of a secret.
  const lines = masked
    .slice(start - 1)
    .map((line) =>
      line.length > EXCERPT_MAX_LINE_CHARS ? `${line.slice(0, EXCERPT_MAX_LINE_CHARS)}…` : line,
    );
  return { status: 'ok', path: entry.path, start, end: start + lines.length - 1, lines };
}
