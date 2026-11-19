import { createHash } from 'node:crypto';
import { LIMITS, type Diagnostic, type Evidence, type GraphRevision } from '@archwise/domain';
import type { InventoryResult, RevisionIds } from '@archwise/application';
import type { ArchitectureGraph } from './graph.js';

/** What the revision needs from the inventory: repositories, manifest ownership and truncation. */
export interface RevisionScan {
  readonly repositories: InventoryResult['repositories'];
  readonly manifests: readonly { readonly repositoryId: string; readonly path: string }[];
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
  const repositoryPaths = new Map(scan.repositories.map((r) => [r.id, r.path]));
  const owners = new Map(scan.manifests.map((m) => [m.path, m.repositoryId]));
  /** Evidence is relative to the repository that owns the manifest. */
  const locate = (rootPath: string): { repositoryId: string; path: string } => {
    const repositoryId = owners.get(rootPath) ?? ROOT_REPOSITORY_ID;
    const base = repositoryPaths.get(repositoryId) ?? '';
    return { repositoryId, path: base === '' ? rootPath : rootPath.slice(base.length + 1) };
  };
  const evidence = new Map<string, Evidence>();
  // IDs hash the root-relative path, so single-root identifiers match earlier releases.
  const addEvidence = (rule: 'package-manifest' | 'package-dependency', path: string): string => {
    const id = `ev-${shortHash(`${rule === 'package-manifest' ? 'manifest' : 'dependency'}:${path}`)}`;
    evidence.set(id, {
      id,
      ...locate(path),
      analyzerId: MANIFEST_ANALYZER.id,
      analyzerVersion: MANIFEST_ANALYZER.version,
      ruleId: rule,
      lines: null,
    });
    return id;
  };

  const nodeIds = new Map<string, string>();
  const nodes = graph.nodes.map((node) => {
    const path = node.evidence[0].path;
    const id = `mod-${shortHash(path)}`;
    nodeIds.set(node.id, id);
    return {
      id,
      kind: 'module' as const,
      label: node.label,
      repositoryId: locate(path).repositoryId,
      confidence: { level: 'observed' as const, reasons: ['manifest-declared'] },
      evidenceIds: [addEvidence('package-manifest', path)],
    };
  });

  const edges = graph.edges.map((edge) => ({
    id: `dep-${shortHash(edge.id)}`,
    kind: 'depends-on' as const,
    sourceId: nodeIds.get(edge.source) ?? edge.source,
    targetId: nodeIds.get(edge.target) ?? edge.target,
    confidence: { level: 'observed' as const, reasons: ['dependency-declared'] },
    evidenceIds: [addEvidence('package-dependency', edge.evidence[0].path)],
  }));

  const codes = [...new Set(graph.diagnostics.map(diagnosticCode))].sort();
  const diagnostics: Diagnostic[] = codes.map((code) => ({
    id: `diag-${code}`,
    severity: 'warning',
    code,
    references: [],
  }));
  const status = graph.diagnostics.length === 0 && scan.truncated === null ? 'complete' : 'partial';

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
