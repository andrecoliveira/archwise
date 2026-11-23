import { createHash } from 'node:crypto';
import {
  LIMITS,
  compareCodeUnits,
  isValidCode,
  type Diagnostic,
  type DiagnosticReference,
  type Evidence,
  type GraphRevision,
  type NodeKind,
} from '@archwise/domain';
import {
  EMPTY_ANALYSIS,
  type AnalysisResult,
  type GapReason,
  type InventoryRepository,
  type InventoryResult,
  type RevisionIds,
} from '@archwise/application';
import {
  viewNodeId,
  type ArchitectureGraph,
  type ArchitectureNode,
  type ViewEvidence,
} from './graph.js';

/** What the revision needs from the inventory: repositories, manifest ownership and truncation. */
export interface RevisionScan {
  /** User roots; only their count is used (several roots change the ID formula). */
  readonly roots: readonly string[];
  readonly repositories: readonly (Pick<InventoryRepository, 'id' | 'label' | 'path' | 'nested'> &
    Partial<Pick<InventoryRepository, 'reached' | 'rootId'>>)[];
  readonly manifests: readonly {
    readonly rootId: string;
    readonly repositoryId: string;
    readonly path: string;
  }[];
  readonly truncated: InventoryResult['truncated'];
}

/** The parts of the analysis a revision records: coverage, failures and gaps. */
export type RevisionAnalysis = Pick<AnalysisResult, 'coverage' | 'failures' | 'gaps'>;

export const MANIFEST_ANALYZER = { id: 'node-manifest', version: '1.0.0' } as const;
const ROOT_REPOSITORY_ID = 'repo-root';

const shortHash = (text: string): string =>
  createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 16);

const DIAGNOSTIC_CODES: readonly [prefix: string, code: string][] = [
  ['Ambiguous package name', 'ambiguous-package-name'],
  ['Ambiguous resource', 'ambiguous-resource'],
  ['Analyzer failed', 'analyzer-failed'],
  ['Unresolved dependency', 'unresolved-dependency'],
  ['Scan truncated', 'scan-truncated'],
  ['Repository not scanned', 'budget-exhausted'],
];

const GAP_CODES: Readonly<Record<GapReason, string>> = {
  unsupported: 'unsupported-input',
  'invalid-syntax': 'invalid-syntax',
  'unmatched-build-context': 'unmatched-build-context',
  'unidentified-datastore': 'unidentified-datastore',
  'too-large': 'input-skipped',
  binary: 'input-skipped',
  unreadable: 'input-skipped',
  budget: 'input-skipped',
};

const KINDS: Readonly<Record<ArchitectureNode['type'], { kind: NodeKind; prefix: string }>> = {
  frontend: { kind: 'frontend', prefix: 'fe' },
  service: { kind: 'service', prefix: 'svc' },
  module: { kind: 'module', prefix: 'mod' },
  datastore: { kind: 'datastore', prefix: 'ds' },
  queue: { kind: 'queue', prefix: 'q' },
  'external-system': { kind: 'external-system', prefix: 'ext' },
  job: { kind: 'job', prefix: 'job' },
};

function diagnosticCode(message: string): string {
  return (
    DIAGNOSTIC_CODES.find(([prefix]) => message.startsWith(prefix))?.[1] ?? 'inventory-warning'
  );
}

function rootLabelOf(label: string): string {
  const trimmed = Array.from(label).slice(0, LIMITS.label).join('');
  return trimmed.length > 0 ? trimmed : 'workspace';
}

/** View reasons such as `client-library:pg` become stable codes (`client-library`). */
function reasonCodes(reasons: readonly string[], fallback: string): string[] {
  const codes = [...new Set(reasons.map((reason) => reason.split(':')[0]!))].filter(isValidCode);
  return codes.length > 0 ? codes.sort(compareCodeUnits) : [fallback];
}

/**
 * Maps the view graph v2 to an `archwise.graph` v1 revision. Package nodes keep the Phase 3
 * identity formula (`mod-` for modules, so unchanged modules keep their IDs); discovered kinds
 * get their own prefixes. Evidence is relative to the repository that owns it. Diagnostic text
 * stays in the Studio view; the revision carries stable codes, with gaps as `info`.
 */
export function buildGraphRevision(
  graph: ArchitectureGraph,
  scan: RevisionScan,
  ids: RevisionIds,
  analysis: RevisionAnalysis = EMPTY_ANALYSIS,
): GraphRevision {
  const multiRoot = scan.roots.length > 1;
  const rootIdOf = (repository: RevisionScan['repositories'][number]): string =>
    repository.rootId ?? (repository.nested ? ROOT_REPOSITORY_ID : repository.id);
  type Owned = RevisionScan['manifests'][number];
  const manifests = new Map(scan.manifests.map((m) => [viewNodeId(m, multiRoot), m]));
  const ownerOf = (viewId: string, path: string): Owned =>
    manifests.get(viewId) ?? { rootId: ROOT_REPOSITORY_ID, repositoryId: ROOT_REPOSITORY_ID, path };
  /** Hash input: the root-relative path, prefixed by the user-root ID when there are several. */
  const keyOf = (owned: Owned): string =>
    multiRoot ? `${owned.rootId}/${owned.path}` : owned.path;
  /** The repository in `rootId` with the longest path prefix of `path`. */
  const locate = (rootId: string, path: string): { repositoryId: string; path: string } => {
    const candidates = scan.repositories
      .filter((r) => rootIdOf(r) === rootId && (r.path === '' || path.startsWith(`${r.path}/`)))
      .sort((a, b) => b.path.length - a.path.length);
    const owner = candidates[0];
    if (!owner) return { repositoryId: rootId, path };
    return {
      repositoryId: owner.id,
      path: owner.path === '' ? path : path.slice(owner.path.length + 1),
    };
  };
  /** User root of a view node; null for workspace-wide technology nodes. */
  const rootOfNode = (node: ArchitectureNode): string | null => {
    if (node.id.startsWith('package:'))
      return ownerOf(node.id, node.evidence[0]?.path ?? '').rootId;
    if (node.id.startsWith('compose:')) {
      if (!multiRoot) return scan.repositories.find((r) => !r.nested)?.id ?? ROOT_REPOSITORY_ID;
      return node.id.slice('compose:'.length, node.id.indexOf('/'));
    }
    return null;
  };
  const versions = new Map(analysis.coverage.map((c) => [c.analyzerId, c.analyzerVersion]));
  const versionOf = (analyzerId: string): string =>
    analyzerId === MANIFEST_ANALYZER.id
      ? MANIFEST_ANALYZER.version
      : (versions.get(analyzerId) ?? '0.0.0');

  const evidence = new Map<string, Evidence>();
  // A single root hashes the root-relative path, so identifiers match earlier releases.
  const addLegacy = (rule: 'package-manifest' | 'package-dependency', owned: Owned): string => {
    const id = `ev-${shortHash(`${rule === 'package-manifest' ? 'manifest' : 'dependency'}:${keyOf(owned)}`)}`;
    const base = scan.repositories.find((r) => r.id === owned.repositoryId)?.path ?? '';
    evidence.set(id, {
      id,
      repositoryId: owned.repositoryId,
      path: base === '' ? owned.path : owned.path.slice(base.length + 1),
      analyzerId: MANIFEST_ANALYZER.id,
      analyzerVersion: MANIFEST_ANALYZER.version,
      ruleId: rule,
      lines: null,
    });
    return id;
  };
  const addEvidence = (rootId: string, item: ViewEvidence): string => {
    const keyPath = multiRoot ? `${rootId}/${item.path}` : item.path;
    const lines = item.lines === null ? 'null' : `${item.lines.start}-${item.lines.end}`;
    const id = `ev-${shortHash(`${item.analyzer}:${item.kind}:${keyPath}:${lines}`)}`;
    evidence.set(id, {
      id,
      ...locate(rootId, item.path),
      analyzerId: item.analyzer,
      analyzerVersion: versionOf(item.analyzer),
      ruleId: item.kind,
      lines: item.lines,
    });
    return id;
  };
  const nodeEvidence = (node: ArchitectureNode, rootId: string): string[] =>
    node.evidence.map((item) =>
      item.kind === 'package-manifest' && node.id.startsWith('package:')
        ? addLegacy('package-manifest', ownerOf(node.id, item.path))
        : addEvidence(rootId, item),
    );

  const nodeIds = new Map<string, string>();
  const nodeRoots = new Map<string, string | null>();
  for (const node of graph.nodes) {
    const { prefix } = KINDS[node.type];
    const key = node.id.startsWith('package:')
      ? keyOf(ownerOf(node.id, node.evidence[0]?.path ?? ''))
      : node.id;
    nodeIds.set(node.id, `${prefix}-${shortHash(key)}`);
    nodeRoots.set(node.id, rootOfNode(node));
  }

  // Node evidence first, so evidence order matches earlier releases (nodes, then edges).
  const ownEvidence = new Map<string, string[]>();
  for (const node of graph.nodes) {
    const rootId = nodeRoots.get(node.id) ?? null;
    if (rootId !== null) ownEvidence.set(node.id, nodeEvidence(node, rootId));
  }

  const edges = graph.edges.map((edge) => {
    const rootId = nodeRoots.get(edge.source) ?? ROOT_REPOSITORY_ID;
    const evidenceIds = edge.evidence.map((item) =>
      item.kind === 'package-dependency'
        ? addLegacy('package-dependency', ownerOf(edge.source, item.path))
        : addEvidence(rootId, item),
    );
    return {
      id: `dep-${shortHash(edge.id)}`,
      kind: edge.type,
      sourceId: nodeIds.get(edge.source) ?? edge.source,
      targetId: nodeIds.get(edge.target) ?? edge.target,
      confidence: {
        level: edge.confidence,
        reasons: reasonCodes(edge.reasons, 'dependency-declared'),
      },
      evidenceIds: [...new Set(evidenceIds)],
      target: edge.target,
    };
  });

  const nodes = graph.nodes.map((node) => {
    const rootId = nodeRoots.get(node.id) ?? null;
    let evidenceIds: string[];
    let repositoryId: string | null = null;
    if (rootId === null) {
      // Workspace-wide technology nodes are backed by the evidence of the edges into them.
      evidenceIds = edges.filter((e) => e.target === node.id).flatMap((e) => e.evidenceIds);
    } else {
      evidenceIds = ownEvidence.get(node.id) ?? [];
      repositoryId = node.id.startsWith('package:')
        ? ownerOf(node.id, node.evidence[0]?.path ?? '').repositoryId
        : locate(rootId, node.evidence[0]?.path ?? '').repositoryId;
    }
    return {
      id: nodeIds.get(node.id)!,
      kind: KINDS[node.type].kind,
      label: node.label,
      repositoryId,
      confidence: {
        level: node.confidence,
        reasons: reasonCodes(node.reasons, 'manifest-declared'),
      },
      evidenceIds: [...new Set(evidenceIds)],
    };
  });

  // Warnings: stable codes for the Studio's diagnostic texts.
  const codes = [...new Set(graph.diagnostics.map(diagnosticCode))].sort();
  const diagnostics: Diagnostic[] = codes.map((code) => ({
    id: `diag-${code}`,
    severity: 'warning',
    code,
    references: [],
  }));
  // Info: coverage gaps, referencing gap evidence (or the package, for unknown engines).
  const info = new Map<string, DiagnosticReference[]>();
  const refer = (code: string, reference: DiagnosticReference): void => {
    const list = info.get(code) ?? [];
    if (!list.some((r) => r.kind === reference.kind && r.id === reference.id)) list.push(reference);
    info.set(code, list);
  };
  for (const gap of analysis.gaps) {
    const id = `ev-${shortHash(`gap:${gap.analyzerId}:${gap.reason}:${gap.repositoryId}:${gap.path}`)}`;
    evidence.set(id, {
      id,
      repositoryId: gap.repositoryId,
      path: gap.path,
      analyzerId: gap.analyzerId,
      analyzerVersion: versionOf(gap.analyzerId),
      ruleId: `gap:${gap.reason}`,
      lines: null,
    });
    refer(GAP_CODES[gap.reason], { kind: 'evidence', id });
  }
  for (const edge of edges) {
    if (edge.target === 'datastore:unknown-sql') {
      refer('unidentified-datastore', { kind: 'node', id: edge.sourceId });
    }
  }
  for (const [code, references] of [...info].sort(([a], [b]) => compareCodeUnits(a, b))) {
    diagnostics.push({
      id: `diag-${code}`,
      severity: 'info',
      code,
      references: references
        .sort((a, b) => compareCodeUnits(a.kind, b.kind) || compareCodeUnits(a.id, b.id))
        .slice(0, LIMITS.references),
    });
  }

  const unreached = scan.repositories.some((r) => r.reached === false);
  const analysisIncomplete = analysis.coverage.some((c) => c.status !== 'complete');
  const status: GraphRevision['status'] =
    graph.diagnostics.length === 0 && scan.truncated === null && !unreached && !analysisIncomplete
      ? 'complete'
      : 'partial';

  return {
    id: ids.revisionId,
    workspaceId: ids.workspaceId,
    parentRevisionId: ids.parentRevisionId,
    createdAt: ids.createdAt,
    status,
    repositories: scan.repositories.map((r) => ({ id: r.id, label: rootLabelOf(r.label) })),
    coverage: [
      ...scan.repositories.map((r) => ({
        repositoryId: r.id,
        analyzerId: MANIFEST_ANALYZER.id,
        analyzerVersion: MANIFEST_ANALYZER.version,
        status,
      })),
      ...analysis.coverage.map((c) => ({
        repositoryId: c.repositoryId,
        analyzerId: c.analyzerId,
        analyzerVersion: c.analyzerVersion,
        status: c.status,
      })),
    ],
    evidence: [...evidence.values()],
    nodes,
    edges: edges.map((edge) => ({
      id: edge.id,
      kind: edge.kind,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      confidence: edge.confidence,
      evidenceIds: edge.evidenceIds,
    })),
    diagnostics,
  };
}
