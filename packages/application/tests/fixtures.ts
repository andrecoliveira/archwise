import type { GraphRevision } from '@archwise/domain';
import type { Clock, Digest, IdGenerator } from '../src/index.js';

export type BuildIds = {
  revisionId: string;
  workspaceId: string;
  parentRevisionId: string | null;
  createdAt: string;
};

/** Synthetic revision with `modules` module nodes; no user source or credentials. */
export function buildRevision(modules: number) {
  return (ids: BuildIds): GraphRevision => ({
    id: ids.revisionId,
    workspaceId: ids.workspaceId,
    parentRevisionId: ids.parentRevisionId,
    createdAt: ids.createdAt,
    status: 'complete',
    repositories: [{ id: 'repo-root', label: 'fixture' }],
    coverage: [
      {
        repositoryId: 'repo-root',
        analyzerId: 'node-manifest',
        analyzerVersion: '1.0.0',
        status: 'complete',
      },
    ],
    evidence: [
      {
        id: 'ev-1',
        repositoryId: 'repo-root',
        analyzerId: 'node-manifest',
        analyzerVersion: '1.0.0',
        ruleId: 'package-manifest',
        path: 'package.json',
        lines: null,
      },
    ],
    nodes: Array.from({ length: modules }, (_, i) => ({
      id: `mod-${i}`,
      kind: 'module' as const,
      label: `Module ${i}`,
      repositoryId: 'repo-root',
      confidence: { level: 'observed' as const, reasons: ['manifest-declared'] },
      evidenceIds: ['ev-1'],
    })),
    edges: [],
    diagnostics: [],
  });
}

export function fakeClock(): Clock {
  let second = 0;
  return {
    now: () => new Date(Date.UTC(2026, 10, 16, 0, 0, second++)).toISOString(),
  };
}

export function sequentialIds(): IdGenerator {
  let counter = 0;
  return { next: (prefix) => `${prefix}-${String(++counter).padStart(24, '0')}` };
}

export const identityDigest: Digest = { sha256Hex: (text) => text };

export const sandboxDoc = (components: number, snapshots = false): string =>
  JSON.stringify({
    format: 'archwise-sandbox',
    version: 1,
    projectSignature: 'sig',
    nodes: Array.from({ length: components }, (_, i) => ({ id: `sandbox-${i}` })),
    connections: [],
    draft: { savedA: snapshots ? {} : null, savedB: null },
  });
