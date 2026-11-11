import { CURRENT_SNAPSHOT_VERSION, type SnapshotVersion } from '@archwise/domain';
export function createApplicationInfo(): Readonly<{ snapshotVersion: SnapshotVersion }> {
  return Object.freeze({ snapshotVersion: CURRENT_SNAPSHOT_VERSION });
}
