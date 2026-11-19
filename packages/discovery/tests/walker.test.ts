import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import type { InventoryRequest, InventoryResult } from '@archwise/application';
import { filesystemInventory } from '../src/index.js';

const posix = process.platform !== 'win32';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const cleanups: string[] = [];
afterEach(async () => {
  for (const dir of cleanups.splice(0)) {
    await chmod(dir, 0o755).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
});

async function tree(files: Record<string, string | Buffer>): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archwise-walk-')));
  cleanups.push(root);
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    if (path.endsWith('/')) await mkdir(join(root, path), { recursive: true });
    else await writeFile(join(root, path), content);
  }
  return root;
}

const pkg = (name: string, dependencies: Record<string, string> = {}) =>
  JSON.stringify({ name, dependencies });

const scan = (root: string, extra: Partial<InventoryRequest> = {}): Promise<InventoryResult> =>
  filesystemInventory.inspect({ root, knownHomes: [], ...extra });

const skipped = (result: InventoryResult, reason: keyof InventoryResult['skipped']) =>
  result.skipped[reason] ?? { count: 0, examples: [] };

describe('ignore rules', () => {
  test('built-ins win over gitignore negation, and gitignore excludes manifests', async () => {
    const root = await tree({
      '.gitignore': 'generated/\n!node_modules/x\n',
      'package.json': pkg('root'),
      'node_modules/x/package.json': pkg('x'),
      'generated/package.json': pkg('gen'),
      'src/package.json': pkg('src'),
    });
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['package.json', 'src/package.json']);
    expect(skipped(result, 'ignored-builtin').examples).toEqual(['node_modules']);
    expect(skipped(result, 'ignored-gitignore').examples).toEqual(['generated']);
  });

  test('a nested .gitignore applies below its directory', async () => {
    const root = await tree({
      'a/.gitignore': 'package.json\n',
      'a/package.json': pkg('a'),
      'b/package.json': pkg('b'),
    });
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['b/package.json']);
    expect(skipped(result, 'ignored-gitignore').examples).toEqual(['a/package.json']);
  });
});

describe('symlinks', () => {
  test('links inside the root are reported and never followed, including cycles', async () => {
    const root = await tree({ 'real/package.json': pkg('real') });
    await symlink(root, join(root, 'cycle'), 'dir');
    await symlink(join(root, 'real'), join(root, 'alias'), 'dir');
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['real/package.json']);
    expect(skipped(result, 'symlink').examples).toEqual(['alias', 'cycle']);
  });

  test('links leaving the root, or dangling, are outside-root and never read', async () => {
    const outside = await tree({ 'package.json': pkg('secret-outside') });
    const root = await tree({ 'keep/package.json': pkg('keep') });
    await symlink(outside, join(root, 'escape'), 'dir');
    await symlink(join(outside, 'package.json'), join(root, 'package.json'), 'file');
    await symlink(join(root, 'missing'), join(root, 'dangling'), 'file');
    const result = await scan(root);
    expect(skipped(result, 'outside-root').examples).toEqual([
      'dangling',
      'escape',
      'package.json',
    ]);
    expect(JSON.stringify(result)).not.toContain('secret-outside');
  });
});

describe('nested repositories', () => {
  test.each([
    ['a .git directory', 'libs/sub/.git/HEAD'],
    ['a .git file (worktree or submodule)', 'libs/sub/.git'],
  ])('%s becomes its own repository', async (_name, marker) => {
    const root = await tree({
      '.git/HEAD': 'ref',
      'package.json': pkg('root'),
      [marker]: 'gitdir: x',
      'libs/sub/pkg/package.json': pkg('sub'),
    });
    const result = await scan(root);
    const nestedId = `repo-${createHash('sha256').update('libs/sub').digest('hex').slice(0, 16)}`;
    expect(result.repositories).toEqual([
      { id: 'repo-root', label: expect.any(String), path: '', nested: false },
      { id: nestedId, label: 'sub', path: 'libs/sub', nested: true },
    ]);
    expect(result.manifests.map((m) => [m.path, m.repositoryId])).toEqual([
      ['libs/sub/pkg/package.json', nestedId],
      ['package.json', 'repo-root'],
    ]);
    expect(skipped(result, 'nested-repository')).toEqual({ count: 1, examples: ['libs/sub'] });
    expect(skipped(result, 'ignored-builtin').examples).toContain('.git');
  });

  test('a nested repository starts a fresh gitignore stack', async () => {
    const root = await tree({
      '.gitignore': '*.json\n',
      'sub/.git/HEAD': 'ref',
      'sub/package.json': pkg('sub'),
    });
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['sub/package.json']);
  });
});

describe('file checks', () => {
  test('oversized and binary manifests are skipped with their reason', async () => {
    const root = await tree({
      'big/package.json': ' '.repeat(1_048_577),
      'bin/package.json': Buffer.from([0x7b, 0x00, 0x7d]),
      'ok/package.json': pkg('ok'),
    });
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['ok/package.json']);
    expect(skipped(result, 'too-large').examples).toEqual(['big/package.json']);
    expect(skipped(result, 'binary').examples).toEqual(['bin/package.json']);
  });

  test('malformed manifests are unreadable and keep the diagnostic', async () => {
    const root = await tree({ 'package.json': '{oops' });
    const result = await scan(root);
    expect(skipped(result, 'unreadable').examples).toEqual(['package.json']);
    expect(result.diagnostics).toContain('Invalid or unreadable manifest: package.json');
  });

  test.skipIf(!posix || isRoot)('an unreadable directory is reported', async () => {
    const root = await tree({ 'locked/package.json': pkg('x'), 'package.json': pkg('root') });
    await chmod(join(root, 'locked'), 0o000);
    cleanups.unshift(join(root, 'locked'));
    const result = await scan(root);
    expect(skipped(result, 'unreadable').examples).toEqual(['locked']);
  });

  test.skipIf(!posix)('special files are never opened', async () => {
    const root = await tree({ 'package.json': pkg('root') });
    execFileSync('mkfifo', [join(root, 'pipe')]);
    const result = await scan(root);
    expect(skipped(result, 'special-file').examples).toEqual(['pipe']);
  });

  test('Unicode names are preserved', async () => {
    const root = await tree({ 'café/package.json': pkg('a'), '日本/package.json': pkg('b') });
    const result = await scan(root);
    expect(result.manifests.map((m) => m.path)).toEqual(['café/package.json', '日本/package.json']);
  });

  test.skipIf(!posix)('a name that cannot be a portable path is unsupported-name', async () => {
    const root = await tree({ 'a\\b/package.json': pkg('x'), 'package.json': pkg('root') });
    const result = await scan(root);
    expect(skipped(result, 'unsupported-name').examples).toEqual(['a\\b']);
    expect(result.manifests.map((m) => m.path)).toEqual(['package.json']);
  });

  test('the manifest hash is SHA-256 of its bytes', async () => {
    const text = pkg('hashed');
    const root = await tree({ 'package.json': text });
    const result = await scan(root);
    expect(result.manifests[0]?.sha256).toBe(createHash('sha256').update(text).digest('hex'));
  });

  test('names are redacted, including known homes', async () => {
    const token = 'AKIA' + 'ABCDEFGHIJKLMNOP';
    const root = await tree({
      'package.json': pkg('/home/alex/app', { [`dep-${token}`]: '1', fastify: '1' }),
    });
    const result = await scan(root, { knownHomes: ['/home/alex'] });
    expect(result.manifests[0]).toMatchObject({
      name: '~/app',
      dependencies: ['dep-[redacted]', 'fastify'],
      framework: 'fastify',
    });
  });
});

describe('budgets', () => {
  test('depth', async () => {
    const root = await tree({ 'a/b/c/package.json': pkg('deep'), 'a/package.json': pkg('a') });
    const result = await scan(root, { budgets: { depth: 2 } });
    expect(result.manifests.map((m) => m.path)).toEqual(['a/package.json']);
    expect(skipped(result, 'too-deep').examples).toEqual(['a/b/c']);
    expect(result.truncated).toBe('depth');
  });

  test('entries', async () => {
    const files = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}.txt`, 'x']));
    const result = await scan(await tree(files), { budgets: { entries: 5 } });
    expect(result.truncated).toBe('entries');
    expect(result.listedEntries).toBe(5);
    expect(skipped(result, 'budget-exhausted').count).toBe(5);
  });

  test('total bytes', async () => {
    const root = await tree({ 'a/package.json': pkg('a'), 'b/package.json': pkg('b') });
    const result = await scan(root, { budgets: { bytesTotal: 20 } });
    expect(result.truncated).toBe('bytes-total');
    expect(result.manifests.length).toBeLessThan(2);
  });

  test('time', async () => {
    let clock = 0;
    const root = await tree({ 'a/package.json': pkg('a'), 'b/package.json': pkg('b') });
    const result = await scan(root, { now: () => (clock += 61_000) });
    expect(result.truncated).toBe('time');
  });

  test('examples are capped at 20 and sorted', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 30 }, (_, i) => [`d${String(29 - i).padStart(2, '0')}/x.txt`, 'x']),
    );
    const result = await scan(await tree({ ...files, '.gitignore': 'd*/\n' }));
    const summary = skipped(result, 'ignored-gitignore');
    expect(summary.count).toBe(30);
    expect(summary.examples).toHaveLength(20);
    expect(summary.examples[0]).toBe('d00');
    expect(summary.examples[19]).toBe('d19');
  });
});

describe('cancellation and determinism', () => {
  test('a pre-aborted signal rejects with AbortError', async () => {
    const root = await tree({ 'package.json': pkg('x') });
    const controller = new AbortController();
    controller.abort();
    await expect(scan(root, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  test('aborting during the scan rejects', async () => {
    const files = Object.fromEntries(Array.from({ length: 600 }, (_, i) => [`f${i}.txt`, 'x']));
    const root = await tree(files);
    const controller = new AbortController();
    await expect(
      scan(root, { signal: controller.signal, onProgress: () => controller.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  test('the same tree yields the same result', async () => {
    const root = await tree({
      'z/package.json': pkg('z', { a: '1' }),
      'a/package.json': pkg('a'),
      'B/package.json': pkg('B'),
      'node_modules/q/package.json': pkg('q'),
    });
    const strip = (result: InventoryResult) => ({ ...result, durationMs: 0 });
    const first = strip(await scan(root));
    expect(strip(await scan(root))).toEqual(first);
    expect(first.manifests.map((m) => m.path)).toEqual([
      'B/package.json',
      'a/package.json',
      'z/package.json',
    ]);
  });

  test('the root label is the redacted directory name, or home for the home directory', async () => {
    const root = await tree({ 'package.json': pkg('x') });
    expect((await scan(root)).repositories[0]?.label).toMatch(/^archwise-walk-/);
    expect((await scan(root, { knownHomes: [root] })).repositories[0]?.label).toBe('home');
  });
});

describe('root errors', () => {
  test.each([
    ['missing', async () => join(await tree({}), 'nope'), 'not-found'],
    ['a file', async () => join(await tree({ f: 'x' }), 'f'), 'not-directory'],
  ])('%s root rejects with a typed reason', async (_name, make, reason) => {
    await expect(scan(await make())).rejects.toMatchObject({
      name: 'InventoryRootError',
      reason,
    });
  });
});

describe('review fixes', () => {
  test('hitting the depth budget marks the scan truncated but keeps scanning', async () => {
    const root = await tree({ 'packages/a/package.json': pkg('a'), 'z/package.json': pkg('z') });
    const result = await scan(root, { budgets: { depth: 1 } });
    expect(result.truncated).toBe('depth');
    expect(skipped(result, 'too-deep').examples).toEqual(['packages/a']);
    expect(result.manifests.map((m) => m.path)).toEqual(['z/package.json']);
  });

  test('an oversized manifest leaves a diagnostic', async () => {
    const root = await tree({ 'package.json': ' '.repeat(1_048_577) });
    const result = await scan(root);
    expect(result.diagnostics).toContain('Manifest exceeds size limit: package.json');
  });

  test.skipIf(!posix || isRoot)(
    'an entry that cannot be stat-ed is skipped, not fatal',
    async () => {
      const root = await tree({ 'ro/package.json': pkg('ro'), 'ok/package.json': pkg('ok') });
      await chmod(join(root, 'ro'), 0o444);
      cleanups.unshift(join(root, 'ro'));
      const result = await scan(root);
      expect(result.manifests.map((m) => m.path)).toEqual(['ok/package.json']);
      expect(skipped(result, 'unreadable').examples).toEqual(['ro/package.json']);
      expect(JSON.stringify(result.diagnostics)).not.toContain(root);
    },
  );

  test('an oversized .gitignore is reported instead of silently ignored', async () => {
    const root = await tree({ '.gitignore': 'ignored/\n', 'ignored/package.json': pkg('i') });
    const result = await scan(root, { budgets: { bytesPerFile: 5 } });
    expect(result.diagnostics).toContain('Ignore file exceeds size limit: .gitignore');
    expect(skipped(result, 'too-large').examples).toContain('.gitignore');
  });

  test('a budget that runs out while reading a .gitignore still accounts for the entries', async () => {
    const root = await tree({ '.gitignore': `${'x'.repeat(80)}\n`, 'a.txt': 'a', 'b.txt': 'b' });
    const result = await scan(root, { budgets: { bytesTotal: 60 } });
    expect(result.truncated).toBe('bytes-total');
    expect(skipped(result, 'budget-exhausted').count).toBe(3);
  });
});
