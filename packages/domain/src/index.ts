export const CURRENT_SNAPSHOT_VERSION = 1 as const;
export type SnapshotVersion = typeof CURRENT_SNAPSHOT_VERSION;

export * from './graph.js';
export * from './primitives.js';
export * from './validation.js';
export * from './revision.js';
