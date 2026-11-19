import type { WorkspaceInventory } from '@archwise/application';
import { walkWorkspace } from './walker.js';

/** The `WorkspaceInventory` port backed by the local filesystem (read-only). */
export const filesystemInventory: WorkspaceInventory = Object.freeze({
  inspect: walkWorkspace,
});
