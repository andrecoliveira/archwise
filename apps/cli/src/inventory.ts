import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';

const IGNORED = new Set([
  '.git',
  '.next',
  '.turbo',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.venv',
  'vendor',
]);
const MAX_DEPTH = 8;
const MAX_ENTRIES = 3000;
const MAX_MANIFEST_BYTES = 256 * 1024;

export interface ManifestEvidence {
  readonly path: string;
  readonly name: string;
  readonly framework: string | null;
  readonly dependencies: readonly string[];
}

export interface InventoryResult {
  readonly version: 1;
  readonly root: string;
  readonly manifests: readonly ManifestEvidence[];
  readonly diagnostics: readonly string[];
  readonly inspectedEntries: number;
}

/** Inspect manifests as data. Do not execute/import any code in the target workspace. */
export async function inspectWorkspace(rootInput: string): Promise<InventoryResult> {
  const root = await realpath(resolve(rootInput));
  if (!(await lstat(root)).isDirectory()) throw new Error('Workspace root must be a directory');
  const manifests: ManifestEvidence[] = [];
  const diagnostics: string[] = [];
  let inspectedEntries = 0;
  let truncated = false;

  const visit = async (directory: string, depth: number): Promise<void> => {
    if (depth > MAX_DEPTH) {
      diagnostics.push('Maximum traversal depth reached');
      return;
    }
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      diagnostics.push(`Unreadable directory: ${relative(root, directory) || '.'}`);
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      if (truncated) return;
      if (inspectedEntries >= MAX_ENTRIES) {
        diagnostics.push('Entry budget exceeded; scan truncated');
        truncated = true;
        return;
      }
      inspectedEntries++;
      if (IGNORED.has(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = join(directory, entry.name);
      const relativePath = relative(root, absolute).split(sep).join('/');
      if (entry.isDirectory()) {
        await visit(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'package.json') continue;
      try {
        const stat = await lstat(absolute);
        if (stat.size > MAX_MANIFEST_BYTES) {
          diagnostics.push(`Manifest exceeds size limit: ${relativePath}`);
          continue;
        }
        const parsed: unknown = JSON.parse(await readFile(absolute, 'utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
          throw new Error('Invalid manifest');
        const data = parsed as Record<string, unknown>;
        const deps = [data.dependencies, data.devDependencies].flatMap((value) =>
          value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : [],
        );
        const frameworks = [
          'next',
          'expo',
          'react-native',
          'vite',
          'fastify',
          'express',
          '@nestjs/core',
        ];
        const framework = frameworks.find((item) => deps.includes(item)) ?? null;
        manifests.push({
          path: relativePath,
          name: typeof data.name === 'string' ? data.name : relativePath,
          framework,
          dependencies: [...new Set(deps)].sort(),
        });
      } catch {
        diagnostics.push(`Invalid or unreadable manifest: ${relativePath}`);
      }
    }
  };
  await visit(root, 0);
  manifests.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { version: 1, root, manifests, diagnostics: [...new Set(diagnostics)], inspectedEntries };
}
