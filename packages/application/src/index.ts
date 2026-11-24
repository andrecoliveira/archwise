import { CURRENT_SNAPSHOT_VERSION, type SnapshotVersion } from '@archwise/domain';

export function createApplicationInfo(): Readonly<{ snapshotVersion: SnapshotVersion }> {
  return Object.freeze({ snapshotVersion: CURRENT_SNAPSHOT_VERSION });
}

export * from './ports.js';
export * from './sandbox-text.js';
export * from './session-service.js';
export * from './memory-store.js';
export * from './inventory.js';
export * from './workspace-key.js';
export * from './analyzer.js';
export * from './run-analyzers.js';
export * from './analysis-inputs.js';
export * from './architecture.js';
export * from './reason-codes.js';
