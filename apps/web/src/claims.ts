import {
  NODE_TYPES,
  kindLabel,
  type EdgeType,
  type Graph,
  type GraphEdge,
  type GraphNode,
} from './graph-types.js';

/*
 * What the Studio says about a component, built only from claims (spec §5.5–§5.7): kind,
 * technology, where it runs, relation counts and relation kinds. No purposes, no adjectives.
 */

export type ConfidenceLevel = 'observed' | 'inferred' | 'unknown';

/** The resolver already names packages by package name, Compose nodes by service, resources by technology. */
export function primaryName(node: GraphNode): string {
  return node.label;
}

const dirname = (path: string): string => {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
};

/** "fastify · apps/api": technology, package folder, then repository in multi-root workspaces. */
export function secondLine(node: GraphNode): string {
  const manifest = node.evidence.find((item) => item.kind === 'package-manifest');
  return [node.technology, manifest ? dirname(manifest.path) : null, node.repository?.label]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
}

const CATEGORY_WORDS: Readonly<Record<string, string>> = {
  payments: 'Payments',
  email: 'Email',
  storage: 'Storage',
  auth: 'Auth',
  ai: 'AI',
  monitoring: 'Monitoring',
};

const COMPOSE_KINDS = new Set(['compose-build', 'compose-service', 'compose-image']);

export function summaryLine(node: GraphNode, view: Graph): string {
  let kind: string;
  let technology = node.technology;
  if (node.type === 'datastore' && node.technology) {
    kind = `${node.technology} datastore`;
    technology = null;
  } else if (node.type === 'external-system' && node.category && CATEGORY_WORDS[node.category]) {
    kind = `${CATEGORY_WORDS[node.category]} API`;
  } else {
    kind = kindLabel(node.type);
  }
  const compose = node.evidence.find((item) => COMPOSE_KINDS.has(item.kind));
  const uses = view.edges.filter((edge) => edge.source === node.id).length;
  const usedBy = view.edges.filter((edge) => edge.target === node.id).length;
  return [
    kind,
    technology,
    compose ? `runs in ${compose.path}` : null,
    confidenceLevel(node) === 'inferred' ? 'inferred' : null,
    uses > 0 ? `uses ${uses}` : null,
    usedBy > 0 ? `used by ${usedBy}` : null,
  ]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ');
}

const WORDING: Readonly<Record<EdgeType, string>> = {
  'depends-on': 'depends on',
  calls: 'calls',
  publishes: 'publishes to',
  consumes: 'consumes from',
  reads: 'reads',
  writes: 'writes',
};

export function relationWording(type: EdgeType): string {
  return WORDING[type];
}

/** Unknown is render-only today: a node of a kind this Studio does not know (spec §12.1, 5). */
export function confidenceLevel(item: GraphNode | GraphEdge): ConfidenceLevel {
  if ('outsideWorkspace' in item && !(NODE_TYPES as readonly string[]).includes(item.type)) {
    return 'unknown';
  }
  return item.confidence;
}

export function lineStyle(level: ConfidenceLevel): 'solid' | 'dashed' | 'dotted' {
  return level === 'observed' ? 'solid' : level === 'inferred' ? 'dashed' : 'dotted';
}

export function levelWord(level: ConfidenceLevel): 'Observed' | 'Inferred' | 'Unknown' {
  return level === 'observed' ? 'Observed' : level === 'inferred' ? 'Inferred' : 'Unknown';
}

const KIND_TOKENS: Readonly<Record<string, string>> = {
  frontend: 'var(--kind-frontend)',
  service: 'var(--kind-service)',
  module: 'var(--kind-module)',
  datastore: 'var(--kind-datastore)',
  queue: 'var(--kind-queue)',
  'external-system': 'var(--kind-external)',
  job: 'var(--kind-job)',
};

/** The kind's fill token, for swatches: fill answers "what is it?" (spec §5.10). */
export function kindToken(type: string): string {
  return KIND_TOKENS[type] ?? 'var(--kind-module)';
}
