import type { SimulatedKind } from './simulation.js';

/** Semantic metadata, not a runtime traffic-routing algorithm. */
export type ConnectionIntent = 'REQ' | 'CACHE' | 'DB' | 'ASYNC' | 'WORK';

export const CONNECTION_INTENTS: readonly ConnectionIntent[] = [
  'REQ',
  'CACHE',
  'DB',
  'ASYNC',
  'WORK',
];

export const CONNECTION_STYLES: Readonly<
  Record<ConnectionIntent, { label: string; color: string; meaning: string }>
> = {
  REQ: { label: 'REQ', color: '#60a5fa', meaning: 'Synchronous request' },
  CACHE: { label: 'CACHE', color: '#34d399', meaning: 'Cache operation' },
  DB: { label: 'DB', color: '#fb923c', meaning: 'Database operation' },
  ASYNC: { label: 'ASYNC', color: '#c084fc', meaning: 'Queue publish' },
  WORK: { label: 'WORK', color: '#fbbf24', meaning: 'Queue consume' },
};

export function isConnectionIntent(value: unknown): value is ConnectionIntent {
  return typeof value === 'string' && CONNECTION_INTENTS.some((intent) => intent === value);
}

export function suggestedIntent(source: SimulatedKind, target: SimulatedKind): ConnectionIntent {
  if (source === 'queue') return 'WORK';
  if (target === 'cache') return 'CACHE';
  if (target === 'database') return 'DB';
  if (target === 'queue') return 'ASYNC';
  return 'REQ';
}

/** Explain incompatible intent without silently changing a user's selected value. */
export function explainConnection(
  source: SimulatedKind,
  target: SimulatedKind,
  intent: ConnectionIntent,
): string | null {
  if (intent === 'CACHE' && target !== 'cache') {
    return 'CACHE must target a Cache component.';
  }
  if (intent === 'DB' && target !== 'database') {
    return 'DB must target a Database component.';
  }
  if (intent === 'ASYNC' && target !== 'queue') {
    return 'ASYNC must publish to a Queue component.';
  }
  if (intent === 'WORK' && source !== 'queue') {
    return 'WORK must originate from a Queue component.';
  }
  if (intent === 'REQ' && (source === 'queue' || target === 'queue')) {
    return 'Use ASYNC to publish to a Queue or WORK to consume from it.';
  }
  return null;
}
