import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { InventoryResult } from '@archwise/application';
import type { ArchitectureGraph, ArchitectureNode, ViewEvidence } from '../src/graph.js';
import {
  EXCERPT_MAX_LINE_CHARS,
  EXCERPT_MAX_LINES,
  buildExcerptIndex,
  readExcerpt,
  type ExcerptEntry,
} from '../src/excerpts.js';
import { repository } from './inventory-fixture.js';

const sha = (text: string | Buffer): string => createHash('sha256').update(text).digest('hex');
const LIMITS = { bytesPerFile: 1_048_576 };

let base: string;
beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'archwise-excerpts-')));
});
afterEach(async () => rm(base, { recursive: true, force: true }));

async function put(root: string, path: string, content: string | Buffer): Promise<void> {
  const full = join(root, path);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

const evidence = (
  path: string,
  kind: string,
  lines: ViewEvidence['lines'] = null,
): ViewEvidence => ({ path, kind, lines, analyzer: 'test' });

const node = (
  id: string,
  items: ViewEvidence[],
  repo?: { id: string; label: string },
): ArchitectureNode => ({
  id,
  type: 'module',
  label: id,
  technology: null,
  confidence: 'observed',
  reasons: ['manifest-declared'],
  outsideWorkspace: false,
  aliases: [],
  origin: 'discovered',
  evidence: items,
  ...(repo ? { repository: repo } : {}),
});

const graphOf = (nodes: ArchitectureNode[]): ArchitectureGraph => ({
  version: 2,
  nodes,
  edges: [],
  diagnostics: [],
  gaps: [],
  inspectedEntries: 0,
});

function singleRoot(
  root: string,
  manifests: Record<string, string>,
  files: Record<string, string> = {},
): InventoryResult {
  return {
    version: 2,
    roots: [root],
    repositories: [repository({ id: 'repo-root', label: 'repo', path: '', nested: false })],
    manifests: Object.entries(manifests).map(([path, text]) => ({
      repositoryId: 'repo-root',
      rootId: 'repo-root',
      path,
      name: path,
      framework: null,
      dependencies: [],
      runtimeDependencies: [],
      devDependencies: [],
      workspaces: null,
      sha256: sha(text),
    })),
    files: Object.entries(files).map(([path, text]) => ({
      repositoryId: 'repo-root',
      rootId: 'repo-root',
      path,
      text,
      problem: null,
    })),
    listedEntries: 0,
    bytesRead: 0,
    skipped: {},
    truncated: null,
    diagnostics: [],
    durationMs: 0,
  };
}

const entry = (root: string, path: string, text: string, lines: ExcerptEntry['lines'] = null) => ({
  root,
  path,
  lines,
  sha256: sha(text),
});

describe('readExcerpt', () => {
  test('allowed evidence returns the cited lines, masked', async () => {
    const text = 'services:\n  db:\n    image: postgres\n    password: x\n  cache:\n';
    await put(base, 'compose.yaml', text);
    const graph = graphOf([
      node('db', [evidence('compose.yaml', 'compose-image', { start: 2, end: 4 })]),
    ]);
    const index = buildExcerptIndex(graph, singleRoot(base, {}, { 'compose.yaml': text }));
    const id = index.decorate(graph).nodes[0]!.evidence[0]!.excerptId!;
    const result = await readExcerpt(index.lookup(id)!, LIMITS);
    expect(result).toEqual({
      status: 'ok',
      path: 'compose.yaml',
      start: 2,
      end: 4,
      lines: ['  db:', '    image: postgres', '    password: [redacted]'],
      truncatedLines: [],
    });
  });

  test('whole-file evidence returns its first 40 lines', async () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n');
    await put(base, 'package.json', text);
    const result = await readExcerpt(entry(base, 'package.json', text), LIMITS);
    expect(result).toMatchObject({ status: 'ok', start: 1, end: EXCERPT_MAX_LINES });
    expect(result.status === 'ok' && result.lines).toHaveLength(40);
  });

  test('path outside the root is refused', async () => {
    await put(base, 'x', 'secret');
    const inner = join(base, 'root');
    await mkdir(inner);
    expect(await readExcerpt(entry(inner, '../x', 'secret'), LIMITS)).toEqual({
      status: 'unavailable',
      reason: 'outside-root',
    });
    expect(await readExcerpt(entry(inner, join(base, 'x'), 'secret'), LIMITS)).toEqual({
      status: 'unavailable',
      reason: 'outside-root',
    });
  });

  test('symlink escape is refused', async () => {
    const root = join(base, 'root');
    await put(base, 'outside/package.json', '{}');
    await mkdir(join(root, 'apps'), { recursive: true });
    await symlink(join(base, 'outside'), join(root, 'apps', 'api'), 'dir');
    expect(await readExcerpt(entry(root, 'apps/api/package.json', '{}'), LIMITS)).toEqual({
      status: 'unavailable',
      reason: 'outside-root',
    });
  });

  test('denied file is refused', async () => {
    await put(base, '.env', 'A=1');
    expect(await readExcerpt(entry(base, '.env', 'A=1'), LIMITS)).toEqual({
      status: 'unavailable',
      reason: 'denied',
    });
  });

  test('over-long range is refused', async () => {
    const text = Array.from({ length: 50 }, (_, i) => `l${i}`).join('\n');
    await put(base, 'compose.yaml', text);
    expect(
      await readExcerpt(entry(base, 'compose.yaml', text, { start: 1, end: 41 }), LIMITS),
    ).toEqual({ status: 'unavailable', reason: 'too-long' });
    expect(
      await readExcerpt(entry(base, 'compose.yaml', text, { start: 1, end: 40 }), LIMITS),
    ).toMatchObject({ status: 'ok', start: 1, end: 40 });
  });

  test('non-UTF-8 file is refused', async () => {
    const bytes = Buffer.from([0xff, 0xfe, 0x41]);
    await put(base, 'compose.yaml', bytes);
    expect(
      await readExcerpt(
        { root: base, path: 'compose.yaml', lines: null, sha256: sha(bytes) },
        LIMITS,
      ),
    ).toEqual({ status: 'unavailable', reason: 'not-utf8' });
  });

  test('file over the size limit is refused', async () => {
    const text = 'x'.repeat(20);
    await put(base, 'compose.yaml', text);
    expect(await readExcerpt(entry(base, 'compose.yaml', text), { bytesPerFile: 10 })).toEqual({
      status: 'unavailable',
      reason: 'too-large',
    });
  });

  test('changed file shows the notice', async () => {
    await put(base, 'package.json', '{"name":"b"}');
    expect(await readExcerpt(entry(base, 'package.json', '{"name":"a"}'), LIMITS)).toEqual({
      status: 'changed',
    });
  });

  test('a missing file is unreadable', async () => {
    expect(await readExcerpt(entry(base, 'gone.json', '{}'), LIMITS)).toEqual({
      status: 'unavailable',
      reason: 'unreadable',
    });
  });
});

describe('buildExcerptIndex', () => {
  test('unknown evidence id is not found', () => {
    const index = buildExcerptIndex(graphOf([]), singleRoot(base, {}));
    expect(index.lookup('0'.repeat(64))).toBeUndefined();
  });

  test('ids are deterministic', async () => {
    const graph = graphOf([node('p', [evidence('package.json', 'package-manifest')])]);
    const inventory = singleRoot(base, { 'package.json': '{}' });
    const first = buildExcerptIndex(graph, inventory).decorate(graph);
    const second = buildExcerptIndex(graph, inventory).decorate(graph);
    const id = first.nodes[0]!.evidence[0]!.excerptId;
    expect(id).toBe(second.nodes[0]!.evidence[0]!.excerptId);
    expect(id).toBe(sha(`${base}\0package.json\0package-manifest\0-`));
    expect('excerptId' in graph.nodes[0]!.evidence[0]!).toBe(false);
  });

  test('evidence for a file the scan never read gets no id', () => {
    const graph = graphOf([node('p', [evidence('other/package.json', 'package-manifest')])]);
    const decorated = buildExcerptIndex(graph, singleRoot(base, {})).decorate(graph);
    expect('excerptId' in decorated.nodes[0]!.evidence[0]!).toBe(false);
  });

  describe('several roots', () => {
    const multi = (one: string, two: string, a: string, b: string): InventoryResult => {
      const manifest = (rootId: string, text: string) => ({
        repositoryId: rootId,
        rootId,
        path: 'package.json',
        name: rootId,
        framework: null,
        dependencies: [],
        runtimeDependencies: [],
        devDependencies: [],
        workspaces: null,
        sha256: sha(text),
      });
      return {
        ...singleRoot(one, {}),
        roots: [one, two],
        repositories: [
          repository({ id: 'r-a', rootId: 'r-a', label: 'a', path: '', nested: false }),
          repository({ id: 'r-b', rootId: 'r-b', label: 'b', path: '', nested: false }),
        ],
        manifests: [manifest('r-a', a), manifest('r-b', b)],
      };
    };

    test("excerpt index picks the node's own root in multi-root workspaces", async () => {
      const one = join(base, 'a');
      const two = join(base, 'b');
      await put(one, 'package.json', '{"name":"a"}');
      await put(two, 'package.json', '{"name":"b"}');
      const graph = graphOf([
        node('A', [evidence('package.json', 'package-manifest')], { id: 'r-a', label: 'a' }),
        node('B', [evidence('package.json', 'package-manifest')], { id: 'r-b', label: 'b' }),
      ]);
      const index = buildExcerptIndex(graph, multi(one, two, '{"name":"a"}', '{"name":"b"}'));
      const decorated = index.decorate(graph);
      const idA = decorated.nodes[0]!.evidence[0]!.excerptId!;
      const idB = decorated.nodes[1]!.evidence[0]!.excerptId!;
      expect(idA).not.toBe(idB);
      expect(await readExcerpt(index.lookup(idA)!, LIMITS)).toMatchObject({
        lines: ['{"name":"a"}'],
      });
      expect(await readExcerpt(index.lookup(idB)!, LIMITS)).toMatchObject({
        lines: ['{"name":"b"}'],
      });
    });

    test('ambiguous evidence gets no excerpt id', () => {
      const one = join(base, 'a');
      const two = join(base, 'b');
      const graph = graphOf([node('datastore:pg', [evidence('package.json', 'client-library')])]);
      const decorated = buildExcerptIndex(graph, multi(one, two, '{}', '{}')).decorate(graph);
      expect('excerptId' in decorated.nodes[0]!.evidence[0]!).toBe(false);
    });
  });
});

test('a secret block scalar that opens above the range stays masked', async () => {
  const text = 'services:\n  db:\n    environment:\n      PGPASSWORD: >-\n        hunter2\n';
  await put(base, 'compose.yaml', text);
  const result = await readExcerpt(entry(base, 'compose.yaml', text, { start: 5, end: 5 }), LIMITS);
  expect(result).toMatchObject({ status: 'ok', lines: ['        [redacted]'] });
});

test('decorating another graph only reuses ids from the scan graph', async () => {
  await put(base, 'package.json', '{}');
  await put(base, 'compose.yaml', 'services: {}\n');
  const scanned = graphOf([node('p', [evidence('package.json', 'package-manifest')])]);
  const index = buildExcerptIndex(
    scanned,
    singleRoot(base, { 'package.json': '{}' }, { 'compose.yaml': 'services: {}\n' }),
  );
  // A stored graph citing a file the scan graph never cited gets no id, and nothing new resolves.
  const stored = graphOf([
    node('p', [evidence('compose.yaml', 'compose-image', { start: 1, end: 1 })]),
  ]);
  const decorated = index.decorate(stored);
  expect('excerptId' in decorated.nodes[0]!.evidence[0]!).toBe(false);
  const would = createHash('sha256')
    .update(`${base}\0compose.yaml\0compose-image\x001-1`)
    .digest('hex');
  expect(index.lookup(would)).toBeUndefined();
  // The scan graph's own evidence still resolves.
  expect(index.decorate(scanned).nodes[0]!.evidence[0]!.excerptId).toBeDefined();
});

test('CR-only line endings split into lines', async () => {
  const text = 'a\rb\rc';
  await put(base, 'compose.yaml', text);
  expect(await readExcerpt(entry(base, 'compose.yaml', text), LIMITS)).toMatchObject({
    status: 'ok',
    start: 1,
    end: 3,
    lines: ['a', 'b', 'c'],
  });
});

test('a very long line is cut at the character cap', async () => {
  const text = `{"name":"${'x'.repeat(5000)}"}`;
  await put(base, 'package.json', text);
  const result = await readExcerpt(entry(base, 'package.json', text), LIMITS);
  expect(result.status).toBe('ok');
  const line = result.status === 'ok' ? result.lines[0]! : '';
  expect(line).toHaveLength(EXCERPT_MAX_LINE_CHARS + 1);
  expect(line.endsWith('…')).toBe(true);
  expect(result).toMatchObject({ truncatedLines: [1] });
});

test('invalid UTF-8 is reported as such even when the scan hashed the lossy text', async () => {
  const bytes = Buffer.from([0x61, 0xff, 0x62]);
  await put(base, 'compose.yaml', bytes);
  const lossy = createHash('sha256').update(bytes.toString('utf8')).digest('hex');
  expect(
    await readExcerpt({ root: base, path: 'compose.yaml', lines: null, sha256: lossy }, LIMITS),
  ).toEqual({ status: 'unavailable', reason: 'not-utf8' });
});
