import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix, win32 } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { InventoryRootError } from '@archwise/application';
import { LIMITS } from '@archwise/domain';
import { makeLabelsUnique, resolveRoots, rootIdBases } from '../src/index.js';

const cleanups: string[] = [];
afterEach(async () => {
  for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function base(...dirs: string[]): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archwise-roots-')));
  cleanups.push(root);
  for (const dir of dirs) await mkdir(join(root, dir), { recursive: true });
  return root;
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);

describe('rootIdBases', () => {
  test.each([
    [posix, ['/w/api', '/w/web'], ['api', 'web']],
    [posix, ['/w', '/w/libs/x'], ['', 'libs/x']],
    [posix, ['/a/x', '/b/y'], ['a/x', 'b/y']],
    [win32, ['C:\\w\\a', 'D:\\b'], ['c/w/a', 'd/b']],
    [win32, ['C:\\w\\a', 'C:\\w\\b'], ['a', 'b']],
  ] as const)('%#: %j', (api, roots, expected) => {
    expect(rootIdBases(roots, api)).toEqual(expected);
  });
});

describe('makeLabelsUnique', () => {
  test('duplicates take their parent directory name', () => {
    expect(
      makeLabelsUnique([
        { label: 'api', parent: 'services' },
        { label: 'api', parent: 'web' },
      ]),
    ).toEqual(['services/api', 'web/api']);
  });

  test('a pinned label is kept', () => {
    expect(
      makeLabelsUnique([
        { label: 'api', parent: 'a', pinned: true },
        { label: 'api', parent: 'b' },
      ]),
    ).toEqual(['api', 'b/api']);
  });

  test('equal parents fall back to a counter', () => {
    expect(
      makeLabelsUnique([
        { label: 'api', parent: 'x' },
        { label: 'api', parent: 'x' },
      ]),
    ).toEqual(['x/api', 'x/api #2']);
  });

  test('results respect the label length limit', () => {
    const long = 'n'.repeat(LIMITS.label);
    const labels = makeLabelsUnique([
      { label: long, parent: 'p' },
      { label: long, parent: 'q' },
    ]);
    for (const label of labels) expect(Array.from(label).length).toBeLessThanOrEqual(LIMITS.label);
    expect(new Set(labels).size).toBe(2);
  });
});

describe('resolveRoots', () => {
  test('a single root is repo-root with an empty id base', async () => {
    const root = await base('shop');
    const [only, ...rest] = await resolveRoots([{ path: join(root, 'shop') }], []);
    expect(rest).toEqual([]);
    expect(only).toEqual({
      id: 'repo-root',
      label: 'shop',
      absolute: join(root, 'shop'),
      idBase: '',
      requestIndex: 0,
    });
  });

  test('sibling roots hash their path from the common ancestor and sort by ID', async () => {
    const root = await base('api', 'web');
    const resolved = await resolveRoots(
      [{ path: join(root, 'web') }, { path: join(root, 'api') }],
      [],
    );
    const expected = [
      { id: `repo-${hash('api')}`, label: 'api', idBase: 'api' },
      { id: `repo-${hash('web')}`, label: 'web', idBase: 'web' },
    ].sort((a, b) => (a.id < b.id ? -1 : 1));
    expect(resolved.map(({ id, label, idBase }) => ({ id, label, idBase }))).toEqual(expected);
  });

  test('duplicates, also through a symlink, merge and keep the first label', async () => {
    const root = await base('api', 'web');
    await symlink(join(root, 'api'), join(root, 'alias'));
    const resolved = await resolveRoots(
      [
        { path: join(root, 'api'), label: 'First' },
        { path: join(root, 'alias'), label: 'Second' },
        { path: join(root, 'web') },
      ],
      [],
    );
    expect(resolved.map((r) => r.label).sort()).toEqual(['First', 'web']);
  });

  test('a request label wins over the directory name', async () => {
    const root = await base('api');
    const [only] = await resolveRoots([{ path: join(root, 'api'), label: 'Payments' }], []);
    expect(only!.label).toBe('Payments');
  });

  test('the home directory is labelled home', async () => {
    const root = await base('alex');
    const [only] = await resolveRoots([{ path: join(root, 'alex') }], [join(root, 'alex')]);
    expect(only!.label).toBe('home');
  });

  test('equal directory names take their parent name', async () => {
    const root = await base('services/api', 'web/api');
    const resolved = await resolveRoots(
      [{ path: join(root, 'services/api') }, { path: join(root, 'web/api') }],
      [],
    );
    expect(resolved.map((r) => r.label).sort()).toEqual(['services/api', 'web/api']);
  });

  test('failures carry the index of the failing root', async () => {
    const root = await base('api');
    await writeFile(join(root, 'file'), 'x');
    await expect(
      resolveRoots([{ path: join(root, 'api') }, { path: join(root, 'missing') }], []),
    ).rejects.toMatchObject({ reason: 'not-found', index: 1 });
    const error = await resolveRoots([{ path: join(root, 'file') }], []).catch((e) => e);
    expect(error).toBeInstanceOf(InventoryRootError);
    expect(error).toMatchObject({ reason: 'not-directory', index: 0 });
  });
});

test('pinned labels are reserved, so an unpinned duplicate never takes one', () => {
  expect(
    makeLabelsUnique([
      { label: 'api', parent: 'svc' },
      { label: 'svc/api', parent: '', pinned: true },
      { label: 'api', parent: 'web' },
    ]),
  ).toEqual(['svc/api #2', 'svc/api', 'web/api']);
});
