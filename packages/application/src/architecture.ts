import { compareCodeUnits, maskConfigValue, redactSensitiveText } from '@archwise/domain';
import type { ExternalCategory } from './reason-codes.js';
import { COMPOSE_PROPERTY_NAMES } from './analyzer.js';
import type {
  ComposePropertyName,
  ComposeRef,
  Fact,
  FactEvidence,
  FactRef,
  GapReason,
  ResourceKind,
} from './analyzer.js';
import type { InventoryManifest, InventoryResult } from './inventory.js';
import type { AnalysisResult } from './run-analyzers.js';

/*
 * View graph v2: what the Studio and `--graph` show. Built from the inventory (packages and
 * declared dependencies) plus analyzer facts. Every node and edge carries its evidence and
 * confidence; ambiguity draws no edge and becomes a diagnostic.
 */

export type ViewNodeType =
  'frontend' | 'service' | 'module' | 'datastore' | 'queue' | 'external-system' | 'job';
export type ViewEdgeType = 'depends-on' | 'calls' | 'publishes' | 'consumes' | 'reads' | 'writes';
export type ViewConfidence = 'observed' | 'inferred';

export interface ViewEvidence {
  /** Path relative to the user root, '/'-separated. */
  readonly path: string;
  readonly kind: string;
  readonly lines: { readonly start: number; readonly end: number } | null;
  readonly analyzer: string;
  /**
   * Served graphs only: the latest scan's opaque key for reading this item's lines
   * (`/api/v1/evidence/excerpt/<id>`). Never stored or exported.
   */
  readonly excerptId?: string;
}

export interface ArchitectureNode {
  readonly id: string;
  readonly type: ViewNodeType;
  readonly label: string;
  readonly technology: string | null;
  readonly confidence: ViewConfidence;
  readonly reasons: readonly string[];
  readonly outsideWorkspace: boolean;
  /** Compose service names linked to a package. */
  readonly aliases: readonly string[];
  readonly origin: 'discovered';
  readonly evidence: readonly ViewEvidence[];
  /** The owning repository; present only in multi-root workspaces. */
  readonly repository?: { readonly id: string; readonly label: string };
  /** External systems only: what it is for, from the analyzer catalog. */
  readonly category?: ExternalCategory;
  /** Allowlisted Compose values, masked, each with its evidence (ADR 0008). */
  readonly properties?: readonly ViewProperty[];
}

export interface ViewProperty {
  readonly name: ComposePropertyName;
  readonly value: string;
  readonly evidence: ViewEvidence;
}

export interface ArchitectureEdge {
  readonly id: string;
  readonly type: ViewEdgeType;
  readonly source: string;
  readonly target: string;
  readonly confidence: ViewConfidence;
  readonly reasons: readonly string[];
  readonly origin: 'discovered';
  readonly evidence: readonly ViewEvidence[];
}

export interface ViewGap {
  readonly path: string;
  readonly analyzer: string;
  readonly reason: GapReason;
}

export interface ArchitectureGraph {
  readonly version: 2;
  readonly nodes: readonly ArchitectureNode[];
  readonly edges: readonly ArchitectureEdge[];
  readonly diagnostics: readonly string[];
  readonly gaps: readonly ViewGap[];
  readonly inspectedEntries: number;
}

export const MANIFEST_ANALYZER_ID = 'node-manifest';

const RESOURCE_PREFIX: Readonly<Record<ResourceKind, string>> = {
  datastore: 'datastore',
  queue: 'queue',
  'external-system': 'external',
};

/**
 * View node ID of a manifest. A single root keeps `package:<path>`; several roots prefix the
 * user-root ID, so equal relative paths in different repositories stay distinct.
 */
export function viewNodeId(
  manifest: { readonly rootId: string; readonly path: string },
  multiRoot: boolean,
): string {
  return multiRoot ? `package:${manifest.rootId}/${manifest.path}` : `package:${manifest.path}`;
}

interface NodeDraft {
  id: string;
  /** User root the node's evidence paths are relative to; null for workspace-wide nodes. */
  rootId: string | null;
  type: ViewNodeType;
  label: string;
  technology: string | null;
  confidence: ViewConfidence;
  reasons: Set<string>;
  outsideWorkspace: boolean;
  aliases: Set<string>;
  evidence: ViewEvidence[];
  repository?: { id: string; label: string };
  category?: ExternalCategory;
  properties: ViewProperty[];
}

interface EdgeDraft {
  id: string;
  source: string;
  target: string;
  confidence: ViewConfidence;
  reasons: Set<string>;
  evidence: ViewEvidence[];
}

const evidenceKey = (item: ViewEvidence): string =>
  `${item.path}\u0000${item.kind}\u0000${item.analyzer}\u0000${item.lines?.start ?? ''}-${item.lines?.end ?? ''}`;

function byEvidence(a: ViewEvidence, b: ViewEvidence): number {
  return (
    compareCodeUnits(a.path, b.path) ||
    compareCodeUnits(a.kind, b.kind) ||
    compareCodeUnits(a.analyzer, b.analyzer) ||
    (a.lines?.start ?? 0) - (b.lines?.start ?? 0)
  );
}

/** Unique evidence; `keepFirst` pins the first item (a package's manifest) in place. */
function tidyEvidence(items: readonly ViewEvidence[], keepFirst: boolean): ViewEvidence[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    const key = evidenceKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!keepFirst) return unique.sort(byEvidence);
  const [first, ...rest] = unique;
  return first ? [first, ...rest.sort(byEvidence)] : [];
}

/** Merge the inventory and analyzer facts into the view graph v2. Deterministic. */
export function resolveArchitecture(
  inventory: InventoryResult,
  analysis: AnalysisResult,
): ArchitectureGraph {
  const multiRoot = inventory.roots.length > 1;
  const repositories = new Map(inventory.repositories.map((r) => [r.id, r]));
  const rootLabel = (rootId: string): string => repositories.get(rootId)?.label ?? rootId;
  /** Paths in messages name the user root in multi-root workspaces. */
  const shownPath = (rootId: string, path: string): string =>
    multiRoot ? `${rootLabel(rootId)}/${path}` : path;
  const shown = (item: InventoryManifest): string => shownPath(item.rootId, item.path);
  const nodeIdOf = (item: InventoryManifest): string => viewNodeId(item, multiRoot);

  // ---- Packages and declared dependencies (Phase 3 rules, unchanged IDs) ----
  const sorted = [...inventory.manifests].sort((a, b) =>
    compareCodeUnits(nodeIdOf(a), nodeIdOf(b)),
  );
  const names = new Map<string, InventoryManifest[]>();
  for (const manifest of sorted) {
    const candidates = names.get(manifest.name) ?? [];
    candidates.push(manifest);
    names.set(manifest.name, candidates);
  }
  const diagnostics = new Set(inventory.diagnostics);
  if (inventory.truncated !== null) {
    diagnostics.add(`Scan truncated: ${inventory.truncated} budget reached. Results are partial.`);
  }
  const ambiguous = new Set<string>();
  for (const [name, candidates] of names) {
    if (candidates.length > 1) {
      ambiguous.add(name);
      diagnostics.add(`Ambiguous package name: ${name} (${candidates.map(shown).join(', ')})`);
    }
  }
  const nodes = new Map<string, NodeDraft>();
  const manifestsByKey = new Map<string, InventoryManifest>();
  for (const item of sorted) {
    manifestsByKey.set(`${item.rootId}\u0000${item.path}`, item);
    const owner = repositories.get(item.repositoryId);
    nodes.set(nodeIdOf(item), {
      id: nodeIdOf(item),
      rootId: item.rootId,
      type: 'module',
      label: item.name,
      technology: item.framework,
      confidence: 'observed',
      reasons: new Set(),
      outsideWorkspace: false,
      aliases: new Set(),
      properties: [],
      evidence: [
        { path: item.path, kind: 'package-manifest', lines: null, analyzer: MANIFEST_ANALYZER_ID },
      ],
      ...(multiRoot && owner ? { repository: { id: owner.id, label: owner.label } } : {}),
    });
  }
  const edges = new Map<string, EdgeDraft>();
  const pairKey = (source: string, target: string): string => `${source}\u0000${target}`;
  for (const manifest of sorted) {
    for (const dependency of [...new Set(manifest.dependencies)].sort()) {
      if (ambiguous.has(dependency)) {
        diagnostics.add(
          `Unresolved dependency ${dependency} in ${shown(manifest)}: multiple workspace matches`,
        );
        continue;
      }
      const target = names.get(dependency)?.[0];
      if (!target || target === manifest) continue;
      const source = nodeIdOf(manifest);
      edges.set(pairKey(source, nodeIdOf(target)), {
        id: `dependency:${source}->${nodeIdOf(target)}`,
        source,
        target: nodeIdOf(target),
        confidence: 'observed',
        reasons: new Set(['dependency-declared']),
        evidence: [
          {
            path: manifest.path,
            kind: 'package-dependency',
            lines: null,
            analyzer: MANIFEST_ANALYZER_ID,
          },
        ],
      });
    }
  }

  // ---- Facts, located in their user root ----
  interface Located {
    readonly analyzerId: string;
    readonly repositoryId: string;
    readonly rootId: string;
    readonly fact: Fact;
  }
  const located: Located[] = [];
  for (const item of analysis.facts) {
    const repository = repositories.get(item.repositoryId);
    if (!repository) continue;
    located.push({
      analyzerId: item.analyzerId,
      repositoryId: item.repositoryId,
      rootId: repository.rootId,
      fact: item.fact,
    });
  }
  const rootRelative = (repositoryId: string, path: string): string => {
    const base = repositories.get(repositoryId)?.path ?? '';
    return base === '' ? path : `${base}/${path}`;
  };
  const view = (at: Located, item: FactEvidence): ViewEvidence => ({
    path: rootRelative(at.repositoryId, item.path),
    kind: item.ruleId,
    lines: item.lines,
    analyzer: at.analyzerId,
  });
  const packageNode = (at: Located, path: string): NodeDraft | undefined => {
    const manifest = manifestsByKey.get(`${at.rootId}\u0000${rootRelative(at.repositoryId, path)}`);
    return manifest ? nodes.get(nodeIdOf(manifest)) : undefined;
  };
  const composeKey = (at: Located, ref: ComposeRef): string =>
    `${at.rootId}\u0000${rootRelative(at.repositoryId, ref.file)}#${ref.service}`;
  const composeNodeId = (at: Located, ref: ComposeRef): string =>
    `compose:${multiRoot ? `${at.rootId}/` : ''}${rootRelative(at.repositoryId, ref.file)}#${ref.service}`;
  const repositoryOf = (at: Located): { id: string; label: string } | undefined => {
    const owner = repositories.get(at.repositoryId);
    return multiRoot && owner ? { id: owner.id, label: owner.label } : undefined;
  };

  // Roles, membership and Compose links on package nodes.
  const roles = new Map<
    string,
    { role: 'frontend' | 'service'; reason: string; technology: string }[]
  >();
  const composeTargets = new Map<string, string>();
  const composeResources = new Map<string, string[]>();
  const labels = new Map<string, string>();
  const categories = new Map<string, ExternalCategory>();
  const technologyOf = new Map<
    string,
    { technology: string; label: string; evidence: ViewEvidence[] }
  >();
  for (const at of located) {
    const { fact } = at;
    if (fact.type === 'package-role') {
      const node = packageNode(at, fact.package);
      if (!node) continue;
      const list = roles.get(node.id) ?? [];
      list.push({ role: fact.role, reason: fact.reason, technology: fact.technology });
      roles.set(node.id, list);
      node.evidence.push(...fact.evidence.map((item) => view(at, item)));
    } else if (fact.type === 'outside-workspace') {
      const node = packageNode(at, fact.package);
      if (node) node.outsideWorkspace = true;
    } else if (fact.type === 'compose-service') {
      const ref = { file: fact.file, service: fact.service };
      const linked = fact.package === null ? undefined : packageNode(at, fact.package);
      if (linked) {
        linked.aliases.add(fact.service);
        linked.reasons.add(`compose-build:${fact.service}`);
        linked.evidence.push(...fact.evidence.map((item) => view(at, item)));
        composeTargets.set(composeKey(at, ref), linked.id);
        continue;
      }
      const id = composeNodeId(at, ref);
      const repository = repositoryOf(at);
      nodes.set(id, {
        id,
        rootId: at.rootId,
        type: 'service',
        label: redactSensitiveText(fact.service),
        technology: fact.image,
        confidence: 'observed',
        reasons: new Set(['compose-service']),
        outsideWorkspace: false,
        aliases: new Set(),
        properties: [],
        evidence: fact.evidence.map((item) => view(at, item)),
        ...(repository ? { repository } : {}),
      });
      composeTargets.set(composeKey(at, ref), id);
    } else if (fact.type === 'resource') {
      labels.set(`${fact.kind}:${fact.technology}`, fact.label);
      const categoryKey = `${fact.kind}:${fact.technology}`;
      if (fact.category !== undefined && !categories.has(categoryKey)) {
        categories.set(categoryKey, fact.category);
      }
      if (fact.compose === null) continue;
      const id = composeNodeId(at, fact.compose);
      const repository = repositoryOf(at);
      nodes.set(id, {
        id,
        rootId: at.rootId,
        type: fact.kind,
        label: redactSensitiveText(fact.compose.service),
        technology: fact.label,
        confidence: fact.confidence,
        reasons: new Set(['compose-image']),
        outsideWorkspace: false,
        aliases: new Set(),
        properties: [],
        evidence: fact.evidence.map((item) => view(at, item)),
        ...(repository ? { repository } : {}),
      });
      composeTargets.set(composeKey(at, fact.compose), id);
      const key = `${fact.kind}:${fact.technology}`;
      composeResources.set(key, [...(composeResources.get(key) ?? []), id]);
    } else if (fact.type === 'datastore-technology') {
      const node = packageNode(at, fact.package);
      if (!node) continue;
      labels.set(`datastore:${fact.technology}`, fact.label);
      const current = technologyOf.get(node.id);
      technologyOf.set(node.id, {
        technology: current?.technology ?? fact.technology,
        label: current?.label ?? fact.label,
        evidence: [...(current?.evidence ?? []), ...fact.evidence.map((item) => view(at, item))],
      });
    }
  }
  for (const at of located) {
    const { fact } = at;
    if (fact.type !== 'compose-property') continue;
    const target = nodes.get(composeTargets.get(composeKey(at, fact.compose)) ?? '');
    const item = fact.evidence[0];
    if (!target || !item) continue;
    target.properties.push({
      name: fact.name,
      value: maskConfigValue(fact.value),
      evidence: view(at, item),
    });
  }
  for (const [id, list] of roles) {
    const node = nodes.get(id)!;
    const chosen = list.find((r) => r.role === 'frontend') ?? list[0]!;
    node.type = chosen.role;
    node.technology = chosen.technology;
    node.confidence = node.aliases.size > 0 ? 'observed' : 'inferred';
    for (const item of list) node.reasons.add(item.reason);
  }
  for (const node of nodes.values()) {
    if (node.type === 'module' && node.aliases.size > 0) {
      node.type = 'service';
      node.confidence = 'observed';
    }
    if (node.id.startsWith('package:') && node.reasons.size === 0)
      node.reasons.add('manifest-declared');
  }

  // ---- Relations ----
  const gaps: ViewGap[] = analysis.gaps.flatMap((gap) => {
    const repository = repositories.get(gap.repositoryId);
    if (!repository) return [];
    return [
      {
        path: shownPath(repository.rootId, rootRelative(gap.repositoryId, gap.path)),
        analyzer: gap.analyzerId,
        reason: gap.reason,
      },
    ];
  });
  interface Pending {
    source: string;
    target: { kind: ResourceKind; technology: string } | string;
    confidence: ViewConfidence;
    reasons: string[];
    evidence: ViewEvidence[];
  }
  const pending: Pending[] = [];
  const resolveRef = (at: Located, ref: FactRef): Pending['target'] | undefined => {
    if ('package' in ref) return packageNode(at, ref.package)?.id;
    if ('compose' in ref) return composeTargets.get(composeKey(at, ref.compose));
    return { kind: ref.resource.kind, technology: ref.resource.technology };
  };
  const prismaLinked = new Set<string>();
  for (const at of located) {
    const { fact } = at;
    if (fact.type !== 'relation') continue;
    const source = resolveRef(at, fact.from);
    let target = resolveRef(at, fact.to);
    if (typeof source !== 'string' || target === undefined) continue;
    const reasons = [fact.reason];
    const evidence = fact.evidence.map((item) => view(at, item));
    if (typeof target !== 'string' && target.kind === 'datastore') {
      const prisma = technologyOf.get(source);
      if (prisma && target.technology === 'unknown-sql') {
        target = { kind: 'datastore', technology: prisma.technology };
        reasons.push('prisma-datasource');
        evidence.push(...prisma.evidence);
      }
      if (prisma && target.technology === prisma.technology) prismaLinked.add(source);
    }
    pending.push({ source, target, confidence: fact.confidence, reasons, evidence });
  }
  for (const [source, prisma] of technologyOf) {
    if (prismaLinked.has(source)) continue;
    pending.push({
      source,
      target: { kind: 'datastore', technology: prisma.technology },
      confidence: 'inferred',
      reasons: ['prisma-datasource'],
      evidence: prisma.evidence,
    });
  }
  for (const item of pending) {
    if (typeof item.target !== 'string' && item.target.technology === 'unknown-sql') {
      const node = nodes.get(item.source);
      const path = node?.evidence[0]?.path;
      if (node?.rootId && path !== undefined) {
        gaps.push({
          path: shownPath(node.rootId, path),
          analyzer: 'node-roles',
          reason: 'unidentified-datastore',
        });
      }
    }
  }
  const technologyNode = (kind: ResourceKind, technology: string): string => {
    const key = `${kind}:${technology}`;
    const candidates = composeResources.get(key) ?? [];
    if (candidates.length === 1) return candidates[0]!;
    const id = `${RESOURCE_PREFIX[kind]}:${technology}`;
    const label = labels.get(key) ?? technology;
    const category = kind === 'external-system' ? categories.get(key) : undefined;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        rootId: null,
        type: kind,
        label,
        technology: label,
        confidence: 'inferred',
        reasons: new Set(['client-library']),
        outsideWorkspace: false,
        aliases: new Set(),
        properties: [],
        evidence: [],
        ...(category ? { category } : {}),
      });
      if (candidates.length > 1) {
        diagnostics.add(
          `Ambiguous resource: ${label} (${[...candidates].sort(compareCodeUnits).join(', ')})`,
        );
      }
    }
    return id;
  };
  for (const item of pending) {
    const target =
      typeof item.target === 'string'
        ? item.target
        : technologyNode(item.target.kind, item.target.technology);
    if (target === item.source || !nodes.has(item.source) || !nodes.has(target)) continue;
    const targetNode = nodes.get(target)!;
    if (
      target.startsWith('datastore:') ||
      target.startsWith('queue:') ||
      target.startsWith('external:')
    ) {
      targetNode.evidence.push(...item.evidence);
    }
    const key = pairKey(item.source, target);
    const edge = edges.get(key) ?? {
      id: `depends-on:${item.source}->${target}`,
      source: item.source,
      target,
      confidence: 'inferred' as ViewConfidence,
      reasons: new Set<string>(),
      evidence: [],
    };
    if (item.confidence === 'observed') edge.confidence = 'observed';
    for (const reason of item.reasons) edge.reasons.add(reason);
    edge.evidence.push(...item.evidence);
    edges.set(key, edge);
  }

  // ---- Failures and output ----
  for (const failure of analysis.failures) {
    const label = repositories.get(failure.repositoryId)?.label ?? failure.repositoryId;
    diagnostics.add(
      `Analyzer failed: ${failure.analyzerId} in ${label}. Its findings were discarded.`,
    );
  }
  const gapKeys = new Set<string>();
  const uniqueGaps = gaps
    .filter((gap) => {
      const key = `${gap.path}\u0000${gap.analyzer}\u0000${gap.reason}`;
      if (gapKeys.has(key)) return false;
      gapKeys.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        compareCodeUnits(a.path, b.path) ||
        compareCodeUnits(a.analyzer, b.analyzer) ||
        compareCodeUnits(a.reason, b.reason),
    );
  return {
    version: 2,
    nodes: [...nodes.values()]
      .sort((a, b) => compareCodeUnits(a.id, b.id))
      .map((node): ArchitectureNode => ({
        id: node.id,
        type: node.type,
        label: node.label,
        technology: node.technology,
        confidence: node.confidence,
        reasons: [...node.reasons].sort(compareCodeUnits),
        outsideWorkspace: node.outsideWorkspace,
        aliases: [...node.aliases].sort(compareCodeUnits),
        origin: 'discovered',
        evidence: tidyEvidence(node.evidence, node.id.startsWith('package:')),
        ...(node.repository ? { repository: node.repository } : {}),
        ...(node.category ? { category: node.category } : {}),
        ...(node.properties.length > 0
          ? {
              properties: [...node.properties].sort(
                (a, b) =>
                  COMPOSE_PROPERTY_NAMES.indexOf(a.name) - COMPOSE_PROPERTY_NAMES.indexOf(b.name) ||
                  compareCodeUnits(a.evidence.path, b.evidence.path),
              ),
            }
          : {}),
      })),
    edges: [...edges.values()]
      .sort((a, b) => compareCodeUnits(a.id, b.id))
      .map((edge): ArchitectureEdge => ({
        id: edge.id,
        type: 'depends-on',
        source: edge.source,
        target: edge.target,
        confidence: edge.confidence,
        reasons: [...edge.reasons].sort(compareCodeUnits),
        origin: 'discovered',
        evidence: tidyEvidence(edge.evidence, edge.id.startsWith('dependency:')),
      })),
    diagnostics: [...diagnostics].sort(compareCodeUnits),
    gaps: uniqueGaps,
    inspectedEntries: inventory.listedEntries,
  };
}
