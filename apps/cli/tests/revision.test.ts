import { createHash } from 'node:crypto';
import { createRevision, isValidId } from '@archwise/domain';
import { serializeGraphRevision } from '@archwise/schemas';
import { expect, test } from 'vitest';
import type { ArchitectureGraph } from '../src/graph.js';
import { buildGraphRevision, type RevisionScan } from '../src/revision.js';

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

/** A single-root scan whose manifests are the graph's nodes. */
const scanOf = (view: ArchitectureGraph, label: string): RevisionScan => ({
  roots: ['/r'],
  repositories: [{ id: 'repo-root', label, path: '', nested: false }],
  manifests: view.nodes.map((n) => ({
    rootId: 'repo-root',
    repositoryId: 'repo-root',
    path: n.evidence[0].path,
  })),
  truncated: null,
});

test('maps packages and declared dependencies to a valid partial revision', () => {
  const revision = buildGraphRevision(graph, scanOf(graph, 'demo-project'), ids);
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
  const revision = buildGraphRevision(graph, scanOf(graph, 'demo'), ids);
  const byLabel = new Map(revision.nodes.map((n) => [n.label, n.id]));
  expect(revision.edges[0]!.sourceId).toBe(byLabel.get('@demo/web'));
  expect(revision.edges[0]!.targetId).toBe(byLabel.get('@demo/core'));
});

test('identifiers are domain-valid and stable', () => {
  const first = buildGraphRevision(graph, scanOf(graph, 'demo'), ids);
  const second = buildGraphRevision(graph, scanOf(graph, 'demo'), ids);
  for (const id of [...first.nodes, ...first.edges, ...first.evidence].map((r) => r.id)) {
    expect(isValidId(id)).toBe(true);
  }
  expect(serializeGraphRevision(first)).toEqual(serializeGraphRevision(second));
});

test('an empty graph is a valid complete revision', () => {
  const empty: ArchitectureGraph = {
    version: 1,
    nodes: [],
    edges: [],
    diagnostics: [],
    inspectedEntries: 0,
  };
  const revision = buildGraphRevision(empty, scanOf(empty, 'empty'), ids);
  expect(revision.status).toBe('complete');
  expect(createRevision(revision).ok).toBe(true);
});

test('diagnostic categories map to stable codes, once each', () => {
  const view: ArchitectureGraph = {
    ...graph,
    diagnostics: [
      'Unresolved dependency x in a/package.json: multiple workspace matches',
      'Unresolved dependency y in b/package.json: multiple workspace matches',
      'Inventory truncated after 3000 entries',
      'Scan truncated: entries budget reached. Results are partial.',
    ],
  };
  const revision = buildGraphRevision(view, scanOf(view, 'demo'), ids);
  expect(revision.diagnostics.map((d) => d.code).sort()).toEqual([
    'inventory-warning',
    'scan-truncated',
    'unresolved-dependency',
  ]);
});

test('long root labels are trimmed to 256 code points', () => {
  const revision = buildGraphRevision(graph, scanOf(graph, '🚀'.repeat(300)), ids);
  expect([...revision.repositories[0]!.label]).toHaveLength(256);
});

test('a nested repository keeps root-relative node IDs and repository-relative evidence', () => {
  const view: ArchitectureGraph = {
    ...graph,
    nodes: [node('package.json', 'root'), node('libs/sub/pkg/package.json', 'sub')],
    edges: [],
    diagnostics: [],
  };
  const scan: RevisionScan = {
    roots: ['/r'],
    repositories: [
      { id: 'repo-root', label: 'demo', path: '', nested: false },
      { id: 'repo-0123456789abcdef', label: 'sub', path: 'libs/sub', nested: true },
    ],
    manifests: [
      { rootId: 'repo-root', repositoryId: 'repo-root', path: 'package.json' },
      {
        rootId: 'repo-root',
        repositoryId: 'repo-0123456789abcdef',
        path: 'libs/sub/pkg/package.json',
      },
    ],
    truncated: null,
  };
  const single = buildGraphRevision(view, scanOf(view, 'demo'), ids);
  const revision = buildGraphRevision(view, scan, ids);
  expect(createRevision(revision).ok).toBe(true);
  expect(revision.nodes.map((n) => n.id)).toEqual(single.nodes.map((n) => n.id));
  expect(revision.repositories).toEqual([
    { id: 'repo-root', label: 'demo' },
    { id: 'repo-0123456789abcdef', label: 'sub' },
  ]);
  expect(revision.evidence.map((e) => [e.repositoryId, e.path]).sort()).toEqual([
    ['repo-0123456789abcdef', 'pkg/package.json'],
    ['repo-root', 'package.json'],
  ]);
  expect(revision.coverage.map((c) => c.repositoryId)).toEqual([
    'repo-root',
    'repo-0123456789abcdef',
  ]);
});

test('a truncated scan is a partial revision even without diagnostics', () => {
  const view: ArchitectureGraph = { ...graph, diagnostics: [] };
  const revision = buildGraphRevision(view, { ...scanOf(view, 'demo'), truncated: 'entries' }, ids);
  expect(revision.status).toBe('partial');
  expect(revision.coverage.every((c) => c.status === 'partial')).toBe(true);
});

test('several roots hash the user-root ID into node IDs and list unreached repositories', () => {
  const apiId = 'repo-1111111111111111';
  const webId = 'repo-2222222222222222';
  const lateId = 'repo-3333333333333333';
  const multiNode = (rootId: string, label: string) => ({
    ...node('package.json', label),
    id: `package:${rootId}/package.json`,
  });
  const view: ArchitectureGraph = {
    version: 1,
    nodes: [multiNode(apiId, '@shop/api'), multiNode(webId, '@shop/web')],
    edges: [
      {
        id: `dependency:package:${webId}/package.json->package:${apiId}/package.json`,
        type: 'declared-dependency',
        source: `package:${webId}/package.json`,
        target: `package:${apiId}/package.json`,
        origin: 'discovered',
        evidence: [{ path: 'package.json', kind: 'package-dependency' }],
      },
    ],
    diagnostics: [],
    inspectedEntries: 2,
  };
  const scan: RevisionScan = {
    roots: ['/w/api', '/w/web', '/w/late'],
    repositories: [
      { id: apiId, label: 'api', path: '', nested: false },
      { id: webId, label: 'web', path: '', nested: false },
      { id: lateId, label: 'late', path: '', nested: false, reached: false },
    ],
    manifests: [
      { rootId: apiId, repositoryId: apiId, path: 'package.json' },
      { rootId: webId, repositoryId: webId, path: 'package.json' },
    ],
    truncated: null,
  };
  const revision = buildGraphRevision(view, scan, ids);
  expect(createRevision(revision).ok).toBe(true);
  const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
  expect(revision.nodes.map((n) => [n.id, n.repositoryId])).toEqual([
    [`mod-${hash(`${apiId}/package.json`)}`, apiId],
    [`mod-${hash(`${webId}/package.json`)}`, webId],
  ]);
  expect(new Set(revision.evidence.map((e) => e.id)).size).toBe(revision.evidence.length);
  expect(revision.edges[0]).toMatchObject({
    sourceId: revision.nodes[1]!.id,
    targetId: revision.nodes[0]!.id,
  });
  expect(revision.repositories.map((r) => r.id)).toEqual([apiId, webId, lateId]);
  expect(revision.status).toBe('partial');
});

test('the not-scanned diagnostic maps to budget-exhausted', () => {
  const view: ArchitectureGraph = {
    ...graph,
    diagnostics: ['Repository not scanned: late. A budget ran out first.'],
  };
  const revision = buildGraphRevision(view, scanOf(view, 'demo'), ids);
  expect(revision.diagnostics.map((d) => d.code)).toEqual(['budget-exhausted']);
});
