import type { InventoryResult, ManifestEvidence } from './inventory.js';

export interface ArchitectureNode {
  readonly id: string;
  readonly type: 'package';
  readonly label: string;
  readonly framework: string | null;
  readonly origin: 'discovered';
  readonly evidence: readonly [{ readonly path: string; readonly kind: 'package-manifest' }];
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

function nodeId(item: ManifestEvidence): string {
  return `package:${item.path}`;
}

/** Build a deterministic graph with evidence. External libraries are NOT deployed services. */
export function buildArchitectureGraph(inventory: InventoryResult): ArchitectureGraph {
  const sorted = [...inventory.manifests].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const names = new Map<string, ManifestEvidence[]>();
  for (const manifest of sorted) {
    const candidates = names.get(manifest.name) ?? [];
    candidates.push(manifest);
    names.set(manifest.name, candidates);
  }
  const diagnostics = [...inventory.diagnostics];
  const ambiguous = new Set<string>();
  for (const [name, candidates] of names) {
    if (candidates.length > 1) {
      ambiguous.add(name);
      diagnostics.push(`Ambiguous package name: ${name} (${candidates.map((item) => item.path).join(', ')})`);
    }
  }
  const nodes: ArchitectureNode[] = sorted.map((item) => ({
    id: nodeId(item),
    type: 'package',
    label: item.name,
    framework: item.framework,
    origin: 'discovered',
    evidence: [{ path: item.path, kind: 'package-manifest' }],
  }));
  const edges: ArchitectureEdge[] = [];
  for (const manifest of sorted) {
    for (const dependency of [...new Set(manifest.dependencies)].sort()) {
      if (ambiguous.has(dependency)) {
        diagnostics.push(`Unresolved dependency ${dependency} in ${manifest.path}: multiple workspace matches`);
        continue;
      }
      const target = names.get(dependency)?.[0];
      if (!target || target.path === manifest.path) continue;
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
  edges.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  return {
    version: 1,
    nodes,
    edges,
    diagnostics: [...new Set(diagnostics)].sort(),
    inspectedEntries: inventory.inspectedEntries,
  };
}
