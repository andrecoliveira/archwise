import { readFile, realpath, stat } from 'node:fs/promises';
import { dirname, parse, resolve } from 'node:path';
import type { RootRequest } from '@archwise/application';
import { parseWorkspaceFile } from '@archwise/schemas';

/** A workspace file that cannot be used. The message is stable, user-facing text. */
export class WorkspaceFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspaceFileError';
  }
}

const MAX_BYTES = 1_048_576;

const code = (error: unknown): string | undefined =>
  (error as NodeJS.ErrnoException | undefined)?.code;

/**
 * Reads a reviewed `archwise.workspace` file. Entries resolve against the directory of the
 * file's real path and must be directories other than a filesystem root. Read-only.
 */
export async function loadWorkspaceFile(file: string): Promise<readonly RootRequest[]> {
  let real: string;
  try {
    real = await realpath(file);
  } catch (error) {
    throw new WorkspaceFileError(
      code(error) === 'ENOENT'
        ? `Workspace file not found: ${file}. Pass an existing file with --workspace.`
        : `Workspace file is not readable: ${file}. Check its permissions.`,
    );
  }
  let text: string;
  try {
    const info = await stat(real);
    if (!info.isFile()) throw new Error('not a file');
    if (info.size > MAX_BYTES) {
      throw new WorkspaceFileError(`Workspace file is too large: ${file}. The limit is 1 MiB.`);
    }
    text = await readFile(real, 'utf8');
  } catch (error) {
    if (error instanceof WorkspaceFileError) throw error;
    throw new WorkspaceFileError(`Workspace file is not readable: ${file}. Check its permissions.`);
  }
  const parsed = parseWorkspaceFile(text);
  if (!parsed.ok) {
    throw new WorkspaceFileError(`Workspace file is not valid: ${file}: ${parsed.problem}.`);
  }
  const base = dirname(real);
  const roots: RootRequest[] = [];
  for (const [index, entry] of parsed.value.repositories.entries()) {
    const fix = `Fix repositories[${index}].path in ${file}.`;
    let path: string;
    const unreadable = `Workspace entry ${index} is not readable: ${entry.path}. Check its permissions.`;
    try {
      path = await realpath(resolve(base, entry.path));
    } catch (error) {
      throw new WorkspaceFileError(
        code(error) === 'ENOENT'
          ? `Workspace entry ${index} not found: ${entry.path}. ${fix}`
          : unreadable,
      );
    }
    if (parse(path).root === path) {
      throw new WorkspaceFileError(
        `Workspace entry ${index} is a filesystem root: ${entry.path}. Point it at a repository directory.`,
      );
    }
    const info = await stat(path).catch(() => null);
    if (info === null) throw new WorkspaceFileError(unreadable);
    if (!info.isDirectory()) {
      throw new WorkspaceFileError(
        `Workspace entry ${index} is not a directory: ${entry.path}. ${fix}`,
      );
    }
    roots.push(entry.label === undefined ? { path } : { path, label: entry.label });
  }
  return roots;
}
