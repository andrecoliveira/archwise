import type { SimulatedKind } from './simulation.js';

export type CatalogGroup = 'Entry & traffic' | 'Compute' | 'Data & messaging';

export interface CatalogComponent {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly group: CatalogGroup;
  readonly kind: SimulatedKind;
  readonly symbol: string;
}

/**
 * UI presets on top of the Alpha's four capacity-only simulation primitives.
 * Client, LB and Worker deliberately do not imply real routing or worker semantics.
 */
export const COMPONENT_CATALOG: readonly CatalogComponent[] = [
  { id: 'client', name: 'Client', description: 'Request entry point', group: 'Entry & traffic', kind: 'service', symbol: '◉' },
  { id: 'load-balancer', name: 'Load Balancer', description: 'Traffic distribution (visual)', group: 'Entry & traffic', kind: 'service', symbol: '⇄' },
  { id: 'app-server', name: 'App Server', description: 'Application processing', group: 'Compute', kind: 'service', symbol: '▣' },
  { id: 'worker', name: 'Worker', description: 'Background processor (visual)', group: 'Compute', kind: 'service', symbol: '⚙' },
  { id: 'cache', name: 'Cache', description: 'Cache with hit-rate input', group: 'Data & messaging', kind: 'cache', symbol: '◇' },
  { id: 'database', name: 'SQL Database', description: 'Storage capacity model', group: 'Data & messaging', kind: 'database', symbol: '▤' },
  { id: 'queue', name: 'Message Queue', description: 'Capacity-only queue model', group: 'Data & messaging', kind: 'queue', symbol: '☷' },
];

export const CATALOG_GROUPS: readonly CatalogGroup[] = [
  'Entry & traffic', 'Compute', 'Data & messaging',
];

export function findCatalogComponent(id: string): CatalogComponent | undefined {
  return COMPONENT_CATALOG.find((item) => item.id === id);
}

export function searchCatalog(query: string): readonly CatalogComponent[] {
  const normalized = query.trim().toLocaleLowerCase();
  return COMPONENT_CATALOG.filter((item) =>
    (item.name + ' ' + item.description + ' ' + item.group).toLocaleLowerCase().includes(normalized),
  );
}
