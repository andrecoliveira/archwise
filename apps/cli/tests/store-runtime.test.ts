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

test('a data directory inside the analyzed root disables the store without writing there', async () => {
  const root = temp('archwise-root-');
  const runtime = await prepareStore({
    enabled: true,
    dataDir: join(root, '.archwise-data'),
    rootPath: root,
    rootLabel: 'root',
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
    rootPath: root,
    rootLabel: 'r',
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
    rootPath: root,
    rootLabel: 'r',
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
    rootPath: root,
    rootLabel: 'r',
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
