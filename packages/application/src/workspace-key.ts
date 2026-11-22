import { compareCodeUnits } from '@archwise/domain';

/**
 * The store identity of a workspace. One root is the canonical root path itself, so earlier
 * sessions are still found. Several roots are the JSON array of their code-unit-sorted
 * canonical paths; it starts with `[`, so it can never equal an absolute path.
 */
export function workspaceKey(roots: readonly string[]): string {
  if (roots.length === 1) return roots[0]!;
  return JSON.stringify([...roots].sort(compareCodeUnits));
}
