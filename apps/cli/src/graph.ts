import type { InventoryManifest, InventoryResult } from '@archwise/application';
import { compareCodeUnits } from '@archwise/domain';

export interface ArchitectureNode {
  readonly id: string;
  readonly type: 'package';
  readonly label: string;
  readonly framework: string | null;
  readonly origin: 'discovered';
  readonly evidence: readonly [{ readonly path: string; readonly kind: 'package-manifest' }];
  /** The owning repository; present only in multi-root workspaces. */
  readonly repository?: { readonly id: string; readonly label: string };
}

export interface ArchitectureEdge {
  readonly id: string;
  readonly type: 'declared-dependency';
  readonly source: string;
  readonly target: string;
  readonly origin: 'discovered';
  readonly evidence: readonly [{ readonly path: string; readonly kind: 'package-dependency' }];
}

export interface ArchitectureGraph {
  readonly version: 1;
  readonly nodes: readonly ArchitectureNode[];
  readonly edges: readonly ArchitectureEdge[];
  readonly diagnostics: readonly string[];
  readonly inspectedEntries: number;
}

/**
 * View node ID of a manifest. A single root keeps `package:<path>`; several roots prefix the
 * user-root ID, so equal relative paths in different repositories stay distinct.
 */
export function viewNodeId(
  manifest: Pick<InventoryManifest, 'rootId' | 'path'>,
  multiRoot: boolean,
): string {
  return multiRoot ? `package:${manifest.rootId}/${manifest.path}` : `package:${manifest.path}`;
}

/** Build a deterministic graph with evidence. External libraries are NOT deployed services. */
export function buildArchitectureGraph(inventory: InventoryResult): ArchitectureGraph {
  const multiRoot = inventory.roots.length > 1;
  const nodeId = (item: InventoryManifest): string => viewNodeId(item, multiRoot);
  const repositories = new Map(inventory.repositories.map((r) => [r.id, r]));
  /** Paths in messages name the user root in multi-root workspaces. */
  const shown = (item: InventoryManifest): string =>
    multiRoot ? `${repositories.get(item.rootId)?.label ?? item.rootId}/${item.path}` : item.path;
  const sorted = [...inventory.manifests].sort((a, b) => compareCodeUnits(nodeId(a), nodeId(b)));
  const names = new Map<string, InventoryManifest[]>();
  for (const manifest of sorted) {
    const candidates = names.get(manifest.name) ?? [];
    candidates.push(manifest);
    names.set(manifest.name, candidates);
  }
  const diagnostics = [...inventory.diagnostics];
  if (inventory.truncated !== null) {
    diagnostics.push(`Scan truncated: ${inventory.truncated} budget reached. Results are partial.`);
  }
  const ambiguous = new Set<string>();
  for (const [name, candidates] of names) {
    if (candidates.length > 1) {
      ambiguous.add(name);
      diagnostics.push(`Ambiguous package name: ${name} (${candidates.map(shown).join(', ')})`);
    }
  }
  const nodes: ArchitectureNode[] = sorted.map((item) => {
    const owner = repositories.get(item.repositoryId);
    return {
      id: nodeId(item),
      type: 'package',
      label: item.name,
      framework: item.framework,
      origin: 'discovered',
      evidence: [{ path: item.path, kind: 'package-manifest' }],
      ...(multiRoot && owner ? { repository: { id: owner.id, label: owner.label } } : {}),
    };
  });
  const edges: ArchitectureEdge[] = [];
  for (const manifest of sorted) {
    for (const dependency of [...new Set(manifest.dependencies)].sort()) {
      if (ambiguous.has(dependency)) {
        diagnostics.push(
          `Unresolved dependency ${dependency} in ${shown(manifest)}: multiple workspace matches`,
        );
        continue;
      }
      const target = names.get(dependency)?.[0];
      if (!target || target === manifest) continue;
      edges.push({
        id: `dependency:${nodeId(manifest)}->${nodeId(target)}`,
        type: 'declared-dependency',
        source: nodeId(manifest),
        target: nodeId(target),
        origin: 'discovered',
        evidence: [{ path: manifest.path, kind: 'package-dependency' }],
      });
    }
  }
  edges.sort((a, b) => compareCodeUnits(a.id, b.id));
  return {
    version: 1,
    nodes,
    edges,
    diagnostics: [...new Set(diagnostics)].sort(compareCodeUnits),
    inspectedEntries: inventory.listedEntries,
  };
}
