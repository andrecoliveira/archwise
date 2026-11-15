import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function tempDir(): { path: string; dispose(): void } {
  const path = mkdtempSync(join(tmpdir(), 'archwise-store-'));
  return { path, dispose: () => rmSync(path, { recursive: true, force: true }) };
}
