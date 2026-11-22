import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, parse } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { WorkspaceFileError, loadWorkspaceFile } from '../src/workspace-file.js';

const cleanups: string[] = [];
afterEach(async () => {
  for (const dir of cleanups.splice(0)) await rm(dir, { recursive: true, force: true });
});

async function base(...dirs: string[]): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'archwise-wsfile-')));
  cleanups.push(root);
  for (const dir of dirs) await mkdir(join(root, dir), { recursive: true });
  return root;
}

const content = (repositories: unknown[]) =>
  JSON.stringify({ format: 'archwise.workspace', version: 1, repositories });

async function workspace(dir: string, repositories: unknown[], name = 'archwise.workspace.json') {
  const file = join(dir, name);
  await writeFile(file, content(repositories));
  return file;
}

const failure = async (file: string): Promise<string> => {
  const error = await loadWorkspaceFile(file).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(WorkspaceFileError);
  return (error as Error).message;
};

test('relative entries resolve against the file directory, .. and absolute paths allowed', async () => {
  const root = await base('team/config', 'team/api', 'web');
  const file = await workspace(join(root, 'team/config'), [
    { path: '../api', label: 'API' },
    { path: join(root, 'web') },
  ]);
  expect(await loadWorkspaceFile(file)).toEqual([
    { path: join(root, 'team/api'), label: 'API' },
    { path: join(root, 'web') },
  ]);
});

test('an entry that climbs to the filesystem root is rejected', async () => {
  const root = await base('x');
  const climb = Array.from({ length: 40 }, () => '..').join('/');
  const file = await workspace(root, [{ path: 'x' }, { path: climb }]);
  expect(await failure(file)).toBe(
    `Workspace entry 1 is a filesystem root: ${climb}. Point it at a repository directory.`,
  );
});

test.skipIf(process.platform === 'win32')(
  'a symlink entry to the filesystem root is rejected',
  async () => {
    const root = await base();
    await symlink(parse(root).root, join(root, 'top'));
    const file = await workspace(root, [{ path: 'top' }]);
    expect(await failure(file)).toBe(
      'Workspace entry 0 is a filesystem root: top. Point it at a repository directory.',
    );
  },
);

test('each file and entry problem has its own message', async () => {
  const root = await base('dir');
  await writeFile(join(root, 'plain'), 'x');
  const missing = join(root, 'nope.json');
  expect(await failure(missing)).toBe(
    `Workspace file not found: ${missing}. Pass an existing file with --workspace.`,
  );
  const big = join(root, 'big.json');
  await writeFile(big, ' '.repeat(1_048_577));
  expect(await failure(big)).toBe(`Workspace file is too large: ${big}. The limit is 1 MiB.`);
  const invalid = join(root, 'bad.json');
  await writeFile(invalid, '{');
  expect(await failure(invalid)).toBe(
    `Workspace file is not valid: ${invalid}: file is not valid JSON.`,
  );
  const gone = await workspace(root, [{ path: 'gone' }], 'gone.json');
  expect(await failure(gone)).toBe(
    `Workspace entry 0 not found: gone. Fix repositories[0].path in ${gone}.`,
  );
  const notDir = await workspace(root, [{ path: 'dir' }, { path: 'plain' }], 'file.json');
  expect(await failure(notDir)).toBe(
    `Workspace entry 1 is not a directory: plain. Fix repositories[1].path in ${notDir}.`,
  );
  expect(await failure(join(root, 'dir'))).toBe(
    `Workspace file is not readable: ${join(root, 'dir')}. Check its permissions.`,
  );
});
