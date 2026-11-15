import type { SessionChanges, Store, StoredRevision, StoredSession, Workspace } from './ports.js';

const byUpdatedDesc = (a: StoredSession, b: StoredSession): number =>
  a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1;

/** In-memory adapter used by tests and by contract verification. */
export function createMemoryStore(): Store {
  const workspaces = new Map<string, Workspace>();
  const revisions = new Map<string, StoredRevision>();
  const sessions = new Map<string, StoredSession>();
  const inWorkspace = <T extends { workspaceId: string }>(value: T | undefined, ws: string) =>
    value && value.workspaceId === ws ? value : null;

  return {
    workspaces: {
      resolve(rootPath, id, createdAt) {
        const existing = workspaces.get(rootPath);
        if (existing) return existing;
        const created = Object.freeze({ id, rootPath, createdAt });
        workspaces.set(rootPath, created);
        return created;
      },
    },
    revisions: {
      latest(workspaceId) {
        let best: StoredRevision | null = null;
        for (const revision of revisions.values()) {
          if (revision.workspaceId !== workspaceId) continue;
          if (
            !best ||
            revision.createdAt > best.createdAt ||
            (revision.createdAt === best.createdAt && revision.id > best.id)
          ) {
            best = revision;
          }
        }
        return best;
      },
      get: (workspaceId, id) => inWorkspace(revisions.get(id), workspaceId),
      insert(revision) {
        if (revisions.has(revision.id)) throw new Error('Duplicate revision');
        revisions.set(revision.id, Object.freeze({ ...revision }));
      },
    },
    sessions: {
      get: (workspaceId, id) => inWorkspace(sessions.get(id), workspaceId),
      list: (workspaceId) =>
        [...sessions.values()].filter((s) => s.workspaceId === workspaceId).sort(byUpdatedDesc),
      insert(session) {
        if (sessions.has(session.id)) throw new Error('Duplicate session');
        sessions.set(session.id, Object.freeze({ ...session }));
      },
      update(workspaceId, id, changes: SessionChanges) {
        const existing = inWorkspace(sessions.get(id), workspaceId);
        if (!existing) return false;
        sessions.set(id, Object.freeze({ ...existing, ...changes }));
        return true;
      },
      delete(workspaceId, id) {
        if (!inWorkspace(sessions.get(id), workspaceId)) return false;
        return sessions.delete(id);
      },
    },
  };
}
