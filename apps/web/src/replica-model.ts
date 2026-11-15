import type { SimulatedKind } from './simulation.js';

export const MAX_REPLICAS = 16;

/** Only capacity-only service processors are currently eligible for modeled replicas. */
export function canScaleComponent(kind: SimulatedKind, preset: string): boolean {
  return kind === 'service' && preset !== 'client' && preset !== 'load-balancer';
}

export function replicaCount(kind: SimulatedKind, preset: string, configured: number | undefined): number {
  if (!canScaleComponent(kind, preset)) return 1;
  return configured !== undefined && Number.isInteger(configured) && configured >= 1 && configured <= MAX_REPLICAS
    ? configured
    : 1;
}

/**
 * Aggregate modeled serving capacity, not a forecast of real horizontal scaling.
 * The toy simulator accepts a maximum of 1m incoming RPS, so larger totals are capped.
 */
export function modeledCapacityRps(
  kind: SimulatedKind,
  preset: string,
  capacityPerReplica: number,
  configured: number | undefined,
): number {
  return Math.min(1_000_000, capacityPerReplica * replicaCount(kind, preset, configured));
}
