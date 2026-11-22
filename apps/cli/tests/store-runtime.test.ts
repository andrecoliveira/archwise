import { mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { ArchitectureGraph } from '../src/graph.js';
import { prepareStore } from '../src/store-runtime.js';

const graph: ArchitectureGraph = {
  version: 1,
  nodes: [],
  edges: [],
  diagnostics: [],
  inspectedEntries: 0,
};
const cleanups: (() => void)[] = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});
const temp = (prefix: string) => {
  const path = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  cleanups.push(() => rmSync(path, { recursive: true, force: true }));
  return path;
};

const scanLabelled = (label: string) => ({
  roots: ['/r'],
  repositories: [{ id: 'repo-root', label, path: '', nested: false }],
  manifests: [],
  truncated: null,
});

test('a data directory inside the analyzed root disables the store without writing there', async () => {
  const root = temp('archwise-root-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: join(root, '.archwise-data'),
    rootPaths: [root],
    scan: scanLabelled('root'),
    graph,
  });
  expect(runtime.kind).toBe('disabled');
  expect(runtime.notices.join(' ')).toMatch(/inside the analyzed project/);
  expect(readdirSync(root)).toEqual([]);
});

test('the analyzed root itself is also refused as a data directory', async () => {
  const root = temp('archwise-root-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: root,
    rootPaths: [root],
    scan: scanLabelled('r'),
    graph,
  });
  expect(runtime.kind).toBe('disabled');
  expect(readdirSync(root)).toEqual([]);
});

test('a data directory outside the root opens the store', async () => {
  const root = temp('archwise-root-');
  const data = temp('archwise-data-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: data,
    rootPaths: [root],
    scan: scanLabelled('r'),
    graph,
  });
  expect(runtime.kind).toBe('ready');
  if (runtime.kind === 'ready') runtime.store.close();
});

test('resumeTarget resolves latest and known ids only', async () => {
  const { resumeTarget } = await import('../src/store-runtime.js');
  const root = temp('archwise-root-');
  const data = temp('archwise-data-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: data,
    rootPaths: [root],
    scan: scanLabelled('r'),
    graph,
  });
  if (runtime.kind !== 'ready') throw new Error('store expected');
  try {
    expect(resumeTarget(runtime.service, 'latest')).toBeNull();
    const id = runtime.service.current().id;
    runtime.service.saveSandbox(
      id,
      JSON.stringify({ format: 'archwise-sandbox', version: 1, nodes: [], draft: {} }),
    );
    expect(resumeTarget(runtime.service, 'latest')).toBe(id);
    expect(resumeTarget(runtime.service, id)).toBe(id);
    expect(resumeTarget(runtime.service, `ses-${'f'.repeat(24)}`)).toBeNull();
  } finally {
    runtime.store.close();
  }
});

test('several roots share one workspace keyed by all of them', async () => {
  const { workspaceKey } = await import('@archwise/application');
  const first = temp('archwise-root-');
  const second = temp('archwise-root-');
  const data = temp('archwise-data-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: data,
    rootPaths: [first, second],
    scan: scanLabelled('r'),
    graph,
  });
  if (runtime.kind !== 'ready') throw new Error('store expected');
  try {
    const key = workspaceKey([first, second]);
    expect(runtime.store.workspaces.resolve(key, 'ws-other', 'now').id).toBe(
      runtime.service.workspaceId,
    );
    expect(runtime.store.workspaces.resolve(first, 'ws-single', 'now').id).toBe('ws-single');
  } finally {
    runtime.store.close();
  }
});

test('a data directory inside any of several roots disables the store', async () => {
  const first = temp('archwise-root-');
  const second = temp('archwise-root-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: join(second, '.archwise-data'),
    rootPaths: [first, second],
    scan: scanLabelled('r'),
    graph,
  });
  expect(runtime.kind).toBe('disabled');
  expect(readdirSync(second)).toEqual([]);
});
