import { createHash } from 'node:crypto';
import { LIMITS, type Diagnostic, type Evidence, type GraphRevision } from '@archwise/domain';
import type { InventoryRepository, InventoryResult, RevisionIds } from '@archwise/application';
import { viewNodeId, type ArchitectureGraph } from './graph.js';

/** What the revision needs from the inventory: repositories, manifest ownership and truncation. */
export interface RevisionScan {
  /** User roots; only their count is used (several roots change the ID formula). */
  readonly roots: readonly string[];
  readonly repositories: readonly (Pick<InventoryRepository, 'id' | 'label' | 'path' | 'nested'> &
    Partial<Pick<InventoryRepository, 'reached'>>)[];
  readonly manifests: readonly {
    readonly rootId: string;
    readonly repositoryId: string;
    readonly path: string;
  }[];
  readonly truncated: InventoryResult['truncated'];
}

export const MANIFEST_ANALYZER = { id: 'node-manifest', version: '1.0.0' } as const;
const ROOT_REPOSITORY_ID = 'repo-root';

const shortHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

const DIAGNOSTIC_CODES: readonly [prefix: string, code: string][] = [
  ['Ambiguous package name', 'ambiguous-package-name'],
  ['Unresolved dependency', 'unresolved-dependency'],
  ['Scan truncated', 'scan-truncated'],
  ['Repository not scanned', 'budget-exhausted'],
];

function diagnosticCode(message: string): string {
  return (
    DIAGNOSTIC_CODES.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'inventory-warning'
  );
}

function rootLabelOf(label: string): string {
  const trimmed = Array.from(label).slice(0, LIMITS.label).join('');
  return trimmed.length > 0 ? trimmed : 'workspace';
}

/**
 * Maps the CLI's package graph to an `archwise.graph` v1 revision. Package manifests become
 * `module` nodes and declared internal dependencies become `depends-on` edges, each backed by
 * the manifest that declares it. Identifiers derive deterministically from relative paths.
 * Diagnostic text stays in the Studio view; the revision carries stable codes only.
 */
export function buildGraphRevision(
  graph: ArchitectureGraph,
  scan: RevisionScan,
  ids: RevisionIds,
): GraphRevision {
  const multiRoot = scan.roots.length > 1;
  const repositoryPaths = new Map(scan.repositories.map((r) => [r.id, r.path]));
  type Owned = RevisionScan['manifests'][number];
  const manifests = new Map(scan.manifests.map((m) => [viewNodeId(m, multiRoot), m]));
  const ownerOf = (viewId: string, path: string): Owned =>
    manifests.get(viewId) ?? { rootId: ROOT_REPOSITORY_ID, repositoryId: ROOT_REPOSITORY_ID, path };
  /** Hash input: the root-relative path, prefixed by the user-root ID when there are several. */
  const keyOf = (owned: Owned): string =>
    multiRoot ? `${owned.rootId}/${owned.path}` : owned.path;
  /** Evidence is relative to the repository that owns the manifest. */
  const locate = (owned: Owned): { repositoryId: string; path: string } => {
    const base = repositoryPaths.get(owned.repositoryId) ?? '';
    return {
      repositoryId: owned.repositoryId,
      path: base === '' ? owned.path : owned.path.slice(base.length + 1),
    };
  };
  const evidence = new Map<string, Evidence>();
  // A single root hashes the root-relative path, so identifiers match earlier releases.
  const addEvidence = (rule: 'package-manifest' | 'package-dependency', owned: Owned): string => {
    const id = `ev-${shortHash(`${rule === 'package-manifest' ? 'manifest' : 'dependency'}:${keyOf(owned)}`)}`;
    evidence.set(id, {
      id,
      ...locate(owned),
      analyzerId: MANIFEST_ANALYZER.id,
      analyzerVersion: MANIFEST_ANALYZER.version,
      ruleId: rule,
      lines: null,
    });
    return id;
  };

  const nodeIds = new Map<string, string>();
  const nodes = graph.nodes.map((node) => {
    const owned = ownerOf(node.id, node.evidence[0]?.path ?? '');
    const id = `mod-${shortHash(keyOf(owned))}`;
    nodeIds.set(node.id, id);
    return {
      id,
      kind: 'module' as const,
      label: node.label,
      repositoryId: owned.repositoryId,
      confidence: { level: 'observed' as const, reasons: ['manifest-declared'] },
      evidenceIds: [addEvidence('package-manifest', owned)],
    };
  });

  const edges = graph.edges.map((edge) => ({
    id: `dep-${shortHash(edge.id)}`,
    kind: 'depends-on' as const,
    sourceId: nodeIds.get(edge.source) ?? edge.source,
    targetId: nodeIds.get(edge.target) ?? edge.target,
    confidence: { level: 'observed' as const, reasons: ['dependency-declared'] },
    evidenceIds: [
      addEvidence('package-dependency', ownerOf(edge.source, edge.evidence[0]?.path ?? '')),
    ],
  }));

  const codes = [...new Set(graph.diagnostics.map(diagnosticCode))].sort();
  const diagnostics: Diagnostic[] = codes.map((code) => ({
    id: `diag-${code}`,
    severity: 'warning',
    code,
    references: [],
  }));
  const unreached = scan.repositories.some((r) => r.reached === false);
  const status =
    graph.diagnostics.length === 0 && scan.truncated === null && !unreached
      ? 'complete'
      : 'partial';

  return {
    id: ids.revisionId,
    workspaceId: ids.workspaceId,
    parentRevisionId: ids.parentRevisionId,
    createdAt: ids.createdAt,
    status,
    repositories: scan.repositories.map((r) => ({ id: r.id, label: rootLabelOf(r.label) })),
    coverage: scan.repositories.map((r) => ({
      repositoryId: r.id,
      analyzerId: MANIFEST_ANALYZER.id,
      analyzerVersion: MANIFEST_ANALYZER.version,
      status,
    })),
    evidence: [...evidence.values()],
    nodes,
    edges,
    diagnostics,
  };
}
