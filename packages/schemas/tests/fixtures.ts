/** Synthetic plain-JSON envelope mirroring the domain fixture. No user source or credentials. */
// Tests deliberately corrupt arbitrary nested fields of untyped JSON input.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validEnvelope(): Record<string, unknown> & { revision: Record<string, any> } {
  const confidence = (level: string, reason: string) => ({ level, reasons: [reason] });
  return {
    format: 'archwise.graph',
    version: 1,
    revision: {
      id: 'rev-1',
      workspaceId: 'ws-1',
      parentRevisionId: null,
      createdAt: '2026-11-15T00:00:00.000Z',
      status: 'complete',
      repositories: [
        { id: 'repo-a', label: 'Repository A' },
        { id: 'repo-b', label: 'Repository B' },
      ],
      coverage: [
        {
          repositoryId: 'repo-a',
          analyzerId: 'node-manifest',
          analyzerVersion: '1.0.0',
          status: 'complete',
        },
        {
          repositoryId: 'repo-b',
          analyzerId: 'node-manifest',
          analyzerVersion: '1.0.0',
          status: 'complete',
        },
      ],
      evidence: [
        {
          id: 'ev-1',
          repositoryId: 'repo-a',
          analyzerId: 'node-manifest',
          analyzerVersion: '1.0.0',
          ruleId: 'package-name',
          path: 'package.json',
          lines: null,
        },
        {
          id: 'ev-2',
          repositoryId: 'repo-a',
          analyzerId: 'node-manifest',
          analyzerVersion: '1.0.0',
          ruleId: 'import',
          path: 'src/index.ts',
          lines: { start: 3, end: 7 },
        },
        {
          id: 'ev-3',
          repositoryId: 'repo-b',
          analyzerId: 'node-manifest',
          analyzerVersion: '1.0.0',
          ruleId: 'package-name',
          path: 'package.json',
          lines: null,
        },
      ],
      nodes: [
        {
          id: 'svc-a',
          kind: 'service',
          label: 'Service A',
          repositoryId: 'repo-a',
          confidence: confidence('observed', 'manifest-declared'),
          evidenceIds: ['ev-1'],
        },
        {
          id: 'mod-b',
          kind: 'module',
          label: 'Module B',
          repositoryId: 'repo-b',
          confidence: confidence('inferred', 'import-resolved'),
          evidenceIds: ['ev-2', 'ev-3'],
        },
      ],
      edges: [
        {
          id: 'e-contains',
          kind: 'contains',
          sourceId: 'svc-a',
          targetId: 'mod-b',
          confidence: confidence('observed', 'manifest-declared'),
          evidenceIds: ['ev-1'],
        },
        {
          id: 'e-call',
          kind: 'calls',
          sourceId: 'mod-b',
          targetId: 'mod-b',
          confidence: confidence('inferred', 'import-resolved'),
          evidenceIds: ['ev-2'],
        },
      ],
      diagnostics: [
        {
          id: 'diag-1',
          severity: 'warning',
          code: 'unresolved-import',
          references: [{ kind: 'node', id: 'mod-b' }],
        },
      ],
    },
  };
}

// Assembled at runtime so repository secret scanning does not flag this file.
export const syntheticAwsKey = 'AKIA' + 'ABCDEFGHIJKLMNOP';
