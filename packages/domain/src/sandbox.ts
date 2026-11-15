import type { GraphRevision } from './graph.js';
import { containsSecretPattern, isValidId } from './primitives.js';
import type { ValidationIssue, ValidationResult } from './validation.js';

/**
 * Readonly pointer from a sandbox to the real revision it is based on. It carries no graph
 * mutations; operation logs, materialization and rebase are later (Phase 7) work.
 */
export interface SandboxReference {
  readonly sandboxId: string;
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly baseRevisionId: string;
}

export function bindSandbox(
  reference: SandboxReference,
  revision: GraphRevision,
): ValidationResult<SandboxReference> {
  const issues: ValidationIssue[] = [];
  for (const field of ['sandboxId', 'workspaceId', 'baseRevisionId'] as const) {
    if (!isValidId(reference[field])) issues.push({ code: 'invalid-id', path: [field] });
    else if (containsSecretPattern(reference[field])) {
      issues.push({ code: 'secret-pattern', path: [field] });
    }
  }
  if ((reference.schemaVersion as number) !== 1) {
    issues.push({ code: 'invalid-value', path: ['schemaVersion'] });
  }
  if (issues.length === 0) {
    if (reference.workspaceId !== revision.workspaceId) {
      issues.push({ code: 'workspace-mismatch', path: ['workspaceId'] });
    }
    if (reference.baseRevisionId !== revision.id) {
      issues.push({ code: 'base-mismatch', path: ['baseRevisionId'] });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: Object.freeze({
      sandboxId: reference.sandboxId,
      schemaVersion: 1,
      workspaceId: reference.workspaceId,
      baseRevisionId: reference.baseRevisionId,
    }),
  };
}
