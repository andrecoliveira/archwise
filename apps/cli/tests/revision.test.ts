import { createRevision, isValidId } from '@archwise/domain';
import { serializeGraphRevision } from '@archwise/schemas';
import { expect, test } from 'vitest';
import type { ArchitectureGraph } from '../src/graph.js';
import { buildGraphRevision } from '../src/revision.js';

const ids = {
  revisionId: 'rev-1',
  workspaceId: 'ws-1',
  parentRevisionId: null,
  createdAt: '2026-11-16T00:00:00.000Z',
};

const node = (path: string, label: string) => ({
  id: `package:${path}`,
  type: 'package' as const,
  label,
  framework: null,
  origin: 'discovered' as const,
  evidence: [{ path, kind: 'package-manifest' as const }] as const,
});

const graph: ArchitectureGraph = {
  version: 1,
  nodes: [
    node('package.json', 'root'),
    node('apps/web/package.json', '@demo/web'),
    node('packages/core/package.json', '@demo/core'),
  ],
  edges: [
    {
      id: 'dependency:package:apps/web/package.json->package:packages/core/package.json',
      type: 'declared-dependency',
      source: 'package:apps/web/package.json',
      target: 'package:packages/core/package.json',
      origin: 'discovered',
      evidence: [{ path: 'apps/web/package.json', kind: 'package-dependency' }],
    },
  ],
  diagnostics: ['Ambiguous package name: dup (a/package.json, b/package.json)'],
  inspectedEntries: 12,
};

test('maps packages and declared dependencies to a valid partial revision', () => {
  const revision = buildGraphRevision(graph, 'demo-project', ids);
  const created = createRevision(revision);
  expect(created.ok).toBe(true);
  expect(revision.status).toBe('partial');
  expect(revision.coverage).toEqual([
    {
      repositoryId: 'repo-root',
      analyzerId: 'node-manifest',
      analyzerVersion: '1.0.0',
      status: 'partial',
    },
  ]);
  expect(revision.repositories).toEqual([{ id: 'repo-root', label: 'demo-project' }]);
  expect(revision.nodes.map((n) => n.kind)).toEqual(['module', 'module', 'module']);
  expect(revision.nodes.map((n) => n.label).sort()).toEqual(['@demo/core', '@demo/web', 'root']);
  expect(revision.edges).toHaveLength(1);
  expect(revision.edges[0]!.kind).toBe('depends-on');
  expect(revision.diagnostics.map((d) => d.code)).toEqual(['ambiguous-package-name']);
});

test('edges point at the nodes derived from the same manifests', () => {
  const revision = buildGraphRevision(graph, 'demo', ids);
  const byLabel = new Map(revision.nodes.map((n) => [n.label, n.id]));
  expect(revision.edges[0]!.sourceId).toBe(byLabel.get('@demo/web'));
  expect(revision.edges[0]!.targetId).toBe(byLabel.get('@demo/core'));
});

test('identifiers are domain-valid and stable', () => {
  const first = buildGraphRevision(graph, 'demo', ids);
  const second = buildGraphRevision(graph, 'demo', ids);
  for (const id of [...first.nodes, ...first.edges, ...first.evidence].map((r) => r.id)) {
    expect(isValidId(id)).toBe(true);
  }
  expect(serializeGraphRevision(first)).toEqual(serializeGraphRevision(second));
});

test('an empty graph is a valid complete revision', () => {
  const revision = buildGraphRevision(
    { version: 1, nodes: [], edges: [], diagnostics: [], inspectedEntries: 0 },
    'empty',
    ids,
  );
  expect(revision.status).toBe('complete');
  expect(createRevision(revision).ok).toBe(true);
});

test('diagnostic categories map to stable codes, once each', () => {
  const revision = buildGraphRevision(
    {
      ...graph,
      diagnostics: [
        'Unresolved dependency x in a/package.json: multiple workspace matches',
        'Unresolved dependency y in b/package.json: multiple workspace matches',
        'Inventory truncated after 3000 entries',
      ],
    },
    'demo',
    ids,
  );
  expect(revision.diagnostics.map((d) => d.code).sort()).toEqual([
    'inventory-warning',
    'unresolved-dependency',
  ]);
});

test('long root labels are trimmed to 256 code points', () => {
  const revision = buildGraphRevision(graph, '🚀'.repeat(300), ids);
  expect([...revision.repositories[0]!.label]).toHaveLength(256);
});
