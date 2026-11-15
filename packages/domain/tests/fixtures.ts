import type { GraphRevision } from '../src/index.js';

export type DeepMutable<T> = T extends readonly (infer U)[]
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;

export type MutableRevision = DeepMutable<GraphRevision>;

/** Synthetic revision; contains no user source, paths outside fixtures, or credentials. */
export function validRevision(): MutableRevision {
  return {
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
        confidence: { level: 'observed', reasons: ['manifest-declared'] },
        evidenceIds: ['ev-1'],
      },
      {
        id: 'mod-b',
        kind: 'module',
        label: 'Module B',
        repositoryId: 'repo-b',
        confidence: { level: 'inferred', reasons: ['import-resolved'] },
        evidenceIds: ['ev-2', 'ev-3'],
      },
    ],
    edges: [
      {
        id: 'e-contains',
        kind: 'contains',
        sourceId: 'svc-a',
        targetId: 'mod-b',
        confidence: { level: 'observed', reasons: ['manifest-declared'] },
        evidenceIds: ['ev-1'],
      },
      {
        id: 'e-call',
        kind: 'calls',
        sourceId: 'mod-b',
        targetId: 'mod-b',
        confidence: { level: 'inferred', reasons: ['import-resolved'] },
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
  };
}

export function emptyRevision(): MutableRevision {
  return {
    id: 'rev-empty',
    workspaceId: 'ws-1',
    parentRevisionId: null,
    createdAt: '2026-11-15T00:00:00.000Z',
    status: 'partial',
    repositories: [],
    coverage: [],
    evidence: [],
    nodes: [],
    edges: [],
    diagnostics: [],
  };
}
