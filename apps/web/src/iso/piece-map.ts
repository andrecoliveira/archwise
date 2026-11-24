/** Which isometric piece draws a component (spec §4.3, §12.1 point 7). */

export const PIECES = [
  'service',
  'frontend',
  'datastore',
  'queue',
  'payments',
  'globe',
  'job',
  'module',
  'unknown',
  'cache',
  'load-balancer',
] as const;
export type PieceName = (typeof PIECES)[number];

const BY_KIND: Readonly<Record<string, PieceName>> = {
  service: 'service',
  frontend: 'frontend',
  datastore: 'datastore',
  queue: 'queue',
  job: 'job',
  module: 'module',
};

export function pieceForNode(node: {
  readonly type: string;
  readonly category?: string;
}): PieceName {
  if (node.type === 'external-system') return node.category === 'payments' ? 'payments' : 'globe';
  return BY_KIND[node.type] ?? 'unknown';
}

const BY_PRESET: Readonly<Record<string, { piece: PieceName; glyph?: 'gear' }>> = {
  client: { piece: 'frontend' },
  'app-server': { piece: 'service' },
  worker: { piece: 'service', glyph: 'gear' },
  database: { piece: 'datastore' },
  queue: { piece: 'queue' },
  cache: { piece: 'cache' },
  'load-balancer': { piece: 'load-balancer' },
};

export function pieceForPreset(preset: string): { piece: PieceName; glyph?: 'gear' } {
  return BY_PRESET[preset] ?? { piece: 'unknown' };
}

/** Fill colour per piece: always the component kind's token (fill = what it is). */
export const PIECE_FILL: Readonly<Record<PieceName, string>> = {
  service: 'var(--kind-service)',
  frontend: 'var(--kind-frontend)',
  datastore: 'var(--kind-datastore)',
  queue: 'var(--kind-queue)',
  payments: 'var(--kind-external)',
  globe: 'var(--kind-external)',
  job: 'var(--kind-job)',
  module: 'var(--kind-module)',
  unknown: 'var(--kind-module)',
  cache: 'var(--kind-cache)',
  'load-balancer': 'var(--kind-service)',
};
