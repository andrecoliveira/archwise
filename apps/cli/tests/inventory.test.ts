import { expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectWorkspace } from '../src/inventory.js';

test('inspects package manifests without following ignored directories or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archwise-inventory-'));
  const external = await mkdtemp(join(tmpdir(), 'archwise-outside-'));
  try {
    await mkdir(join(root, 'apps', 'api'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'hidden'), { recursive: true });
    await writeFile(join(root, 'apps', 'api', 'package.json'), JSON.stringify({
      name: '@demo/api',
      dependencies: { fastify: 'latest' },
    }));
    await writeFile(join(root, 'node_modules', 'hidden', 'package.json'), '{"name":"hidden"}');
    await writeFile(join(external, 'package.json'), '{"name":"external"}');
    await symlink(external, join(root, 'linked'), 'dir');
    const result = await inspectWorkspace(root);
    expect(result.manifests.map((item) => item.name)).toEqual(['@demo/api']);
    expect(result.manifests[0]?.framework).toBe('fastify');
    expect(result.manifests[0]?.path).toBe('apps/api/package.json');
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(external, { recursive: true, force: true });
  }
});

test('reports malformed manifests without failing the entire scan', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archwise-invalid-'));
  try {
    await writeFile(join(root, 'package.json'), '{oops');
    const result = await inspectWorkspace(root);
    expect(result.manifests).toEqual([]);
    expect(result.diagnostics).toContain('Invalid or unreadable manifest: package.json');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
