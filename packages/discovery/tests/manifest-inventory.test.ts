import { expect, test } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspectWorkspace } from '../src/index.js';

test('inspects package manifests without following ignored directories or symlinks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archwise-inventory-'));
  const external = await mkdtemp(join(tmpdir(), 'archwise-outside-'));
  try {
    await mkdir(join(root, 'apps', 'api'), { recursive: true });
    await mkdir(join(root, 'node_modules', 'hidden'), { recursive: true });
    await writeFile(
      join(root, 'apps', 'api', 'package.json'),
      JSON.stringify({
        name: '@demo/api',
        dependencies: { fastify: 'latest' },
      }),
    );
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

test('redacts home directories and secret shapes in names read from manifests', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archwise-redact-'));
  const token = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  try {
    await mkdir(join(root, 'a'), { recursive: true });
    await mkdir(join(root, 'b'), { recursive: true });
    await writeFile(
      join(root, 'a', 'package.json'),
      JSON.stringify({ name: '/Users/alex/app', dependencies: { [`dep-${token}`]: '1' } }),
    );
    await writeFile(join(root, 'b', 'package.json'), JSON.stringify({ name: `dep-${token}` }));
    const result = await inspectWorkspace(root);
    expect(result.manifests.map((item) => item.name)).toEqual(['~/app', 'dep-[redacted]']);
    expect(result.manifests[0]?.dependencies).toEqual(['dep-[redacted]']);
    const text = JSON.stringify(result.manifests);
    expect(text).not.toContain('/Users/alex');
    expect(text).not.toContain(token);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('redacts the running user home directory supplied by the caller', async () => {
  const root = await mkdtemp(join(tmpdir(), 'archwise-home-'));
  try {
    await writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: '/home/alex/app', dependencies: { '/home/feed': '1' } }),
    );
    const result = await inspectWorkspace(root, { knownHomes: ['/home/alex'] });
    expect(result.manifests[0]?.name).toBe('~/app');
    expect(result.manifests[0]?.dependencies).toEqual(['/home/feed']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
