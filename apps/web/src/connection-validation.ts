import type { ConnectionIntent } from './connection-intents.js';

export interface DirectedLink {
  readonly source: string;
  readonly target: string;
}

export type ConnectionCheck =
  { readonly valid: true } | { readonly valid: false; readonly reason: string };

/**
 * Only a proposed DAG can be evaluated by the current Simulation Engine.
 * Keep this validation separate from visual semantic labels.
 */
export function validateProposedConnection(
  source: string,
  target: string,
  proposedIds: ReadonlySet<string>,
  existing: readonly DirectedLink[],
): ConnectionCheck {
  if (!proposedIds.has(source) || !proposedIds.has(target)) {
    return {
      valid: false,
      reason: 'Connect two proposed components. Discovered packages cannot be linked in Sandbox.',
    };
  }
  if (source === target) {
    return { valid: false, reason: 'Connect the output of one component to the input of another.' };
  }
  if (existing.some((edge) => edge.source === source && edge.target === target)) {
    return { valid: false, reason: 'These components are already connected in this direction.' };
  }
  const neighbors = new Map<string, string[]>();
  for (const edge of existing) {
    neighbors.set(edge.source, [...(neighbors.get(edge.source) ?? []), edge.target]);
  }
  const visited = new Set<string>();
  const pending = [target];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node === source) {
      return {
        valid: false,
        reason:
          'This connection creates a cycle. The current capacity simulator supports directed acyclic designs only.',
      };
    }
    if (visited.has(node)) continue;
    visited.add(node);
    pending.push(...(neighbors.get(node) ?? []));
  }
  return { valid: true };
}

export const CONNECTION_HELP_TEXT: Readonly<Record<ConnectionIntent, string>> = {
  REQ: 'A synchronous request from the source to the destination.',
  CACHE: 'A cache lookup, with the cache as destination.',
  DB: 'A database operation, with the database as destination.',
  ASYNC: 'An asynchronous message sent to a queue.',
  WORK: 'A worker or service consuming work from a queue.',
};
