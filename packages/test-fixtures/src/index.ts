import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export interface Fixture {
  readonly root: string;
  dispose(): Promise<void>;
}

/** Creates only synthetic files inside a fresh, owned temporary directory. */
export async function createFixture(files: Readonly<Record<string, string>>): Promise<Fixture> {
  const entries = Object.entries(files);
  for (const [path] of entries) {
    if (
      !path ||
      path.includes('\\') ||
      path.includes(':') ||
      path.includes('\0') ||
      path.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      throw new Error('Fixture paths must be normalized relative paths');
    }
  }
  const root = await mkdtemp(join(tmpdir(), 'archwise-fixture-'));
  const dispose = async () => {
    await rm(root, { recursive: true, force: true });
  };
  try {
    for (const [path, content] of entries) {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, { flag: 'wx' });
    }
    return Object.freeze({ root, dispose });
  } catch (error) {
    await dispose();
    throw error;
  }
}
