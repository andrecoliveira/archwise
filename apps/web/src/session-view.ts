import { upgradeGraph, type Graph } from './graph-types.js';

/**
 * Chooses which graph the workspace renders. A session based on an older discovery revision
 * shows its stored view (so its Sandbox signature matches and the user sees the architecture
 * the session was built against); otherwise the current discovery is shown.
 */
export function chooseWorkspaceGraph(
  detail: { readonly baseIsCurrent: boolean; readonly view: unknown } | null,
  current: Graph,
): { readonly graph: Graph; readonly historical: boolean } {
  const stored = detail && !detail.baseIsCurrent ? upgradeGraph(detail.view) : null;
  return stored === null
    ? { graph: current, historical: false }
    : { graph: stored, historical: true };
}
