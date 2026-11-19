import {
  containsSecretPattern,
  createRevision,
  isValidLabel,
  type GraphRevision,
  type ValidationIssue,
} from '@archwise/domain';
import { serializeGraphRevision } from '@archwise/schemas';
import type {
  Clock,
  Digest,
  IdGenerator,
  Store,
  StoredRevision,
  StoredScan,
  StoredSession,
} from './ports.js';
import { inspectSandboxText } from './sandbox-text.js';

export interface SessionSummary {
  readonly id: string;
  readonly label: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly componentCount: number;
  readonly hasSnapshots: boolean;
  readonly baseIsCurrent: boolean;
}

export interface SessionDetail extends SessionSummary {
  readonly sandbox: string;
  readonly view: string;
}

export type ServiceError = 'not-found' | 'too-large' | 'invalid-sandbox' | 'invalid-label';
export type ServiceResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ServiceError };

export interface RevisionIds {
  readonly revisionId: string;
  readonly workspaceId: string;
  readonly parentRevisionId: string | null;
  readonly createdAt: string;
}

export interface DiscoveryInput {
  readonly rootPath: string;
  readonly view: string;
  /**
   * The view content that must match for a revision to be reused (e.g. framework labels and
   * diagnostic text the canonical revision does not carry), excluding volatile counters.
   */
  readonly viewIdentity: string;
  readonly build: (ids: RevisionIds) => GraphRevision;
  /** The scan that produced this discovery; recorded against the resolved revision. */
  readonly scan?: Omit<StoredScan, 'id' | 'workspaceId' | 'revisionId'>;
}

export interface SessionServiceDeps {
  readonly store: Store;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly digest: Digest;
}

export class RevisionInvalidError extends Error {
  readonly issues: readonly ValidationIssue[];
  constructor(issues: readonly ValidationIssue[]) {
    super('Discovered graph is not a valid archwise.graph revision');
    this.name = 'RevisionInvalidError';
    this.issues = issues;
  }
}

const fail = (error: ServiceError): { readonly ok: false; readonly error: ServiceError } => ({
  ok: false,
  error,
});

const defaultLabel = (count: number): string =>
  `Sandbox · ${count} component${count === 1 ? '' : 's'}`;

/**
 * Fingerprint of the discovered content: the canonical revision (independent of identity,
 * time and parent) plus the view identity, so a changed view never reuses a stale stored view.
 */
function fingerprint(revision: GraphRevision, viewIdentity: string, digest: Digest): string {
  const serialized = serializeGraphRevision({
    ...revision,
    id: 'rev-fingerprint',
    createdAt: '1970-01-01T00:00:00.000Z',
    parentRevisionId: null,
  });
  if (!serialized.ok) throw new RevisionInvalidError(serialized.issues);
  return digest.sha256Hex(`${serialized.value}\n${viewIdentity}`);
}

/**
 * Sessions for one workspace and one discovery run. Each run reserves a fresh session that is
 * persisted only on its first Sandbox save; resuming continues a stored session in place.
 */
export class SessionService {
  readonly workspaceId: string;
  readonly currentRevisionId: string;
  readonly #deps: SessionServiceDeps;
  #current: { id: string; persisted: boolean };

  private constructor(deps: SessionServiceDeps, workspaceId: string, revisionId: string) {
    this.#deps = deps;
    this.workspaceId = workspaceId;
    this.currentRevisionId = revisionId;
    this.#current = { id: deps.ids.next('ses'), persisted: false };
  }

  static open(deps: SessionServiceDeps, discovery: DiscoveryInput): ServiceResult<SessionService> {
    const { store, clock, ids, digest } = deps;
    const workspace = store.workspaces.resolve(discovery.rootPath, ids.next('ws'), clock.now());
    const latest = store.revisions.latest(workspace.id);
    const created = createRevision(
      discovery.build({
        revisionId: ids.next('rev'),
        workspaceId: workspace.id,
        parentRevisionId: latest?.id ?? null,
        createdAt: clock.now(),
      }),
    );
    if (!created.ok) throw new RevisionInvalidError(created.issues);
    const print = fingerprint(created.value, discovery.viewIdentity, digest);
    let revisionId = created.value.id;
    if (latest && latest.fingerprint === print) {
      revisionId = latest.id;
    } else {
      store.revisions.insert({
        id: created.value.id,
        workspaceId: workspace.id,
        fingerprint: print,
        createdAt: created.value.createdAt,
        revision: created.value,
        view: discovery.view,
      });
    }
    if (discovery.scan) {
      store.scans.record({
        ...discovery.scan,
        id: ids.next('scan'),
        workspaceId: workspace.id,
        revisionId,
      });
    }
    return { ok: true, value: new SessionService(deps, workspace.id, revisionId) };
  }

  /** The most recent recorded scan of this workspace, or null. */
  lastScan(): StoredScan | null {
    return this.#deps.store.scans.latest(this.workspaceId);
  }

  current(): { readonly id: string; readonly persisted: boolean } {
    return { ...this.#current };
  }

  /** Reserves a fresh, unpersisted session as current (e.g. "New session" in the Studio). */
  startNew(): { readonly id: string; readonly persisted: boolean } {
    this.#current = { id: this.#deps.ids.next('ses'), persisted: false };
    return { ...this.#current };
  }

  list(): readonly SessionSummary[] {
    return this.#deps.store.sessions
      .list(this.workspaceId)
      .map((session) => this.#summary(session));
  }

  get(id: string): ServiceResult<SessionDetail> {
    const session = this.#deps.store.sessions.get(this.workspaceId, id);
    if (!session) return fail('not-found');
    const base = this.#deps.store.revisions.get(this.workspaceId, session.baseRevisionId);
    if (!base) return fail('not-found');
    return { ok: true, value: this.#detail(session, base) };
  }

  /**
   * Continues a stored session in place. A reserved, never-persisted current ID is discarded:
   * nothing was stored under it, and later saves to it are rejected as not-found.
   */
  resume(id: string): ServiceResult<SessionDetail> {
    const detail = this.get(id);
    if (detail.ok) this.#current = { id, persisted: true };
    return detail;
  }

  saveSandbox(id: string, text: string): ServiceResult<SessionSummary> {
    const isReserved = id === this.#current.id && !this.#current.persisted;
    const existing = isReserved ? null : this.#deps.store.sessions.get(this.workspaceId, id);
    if (!isReserved && !existing) return fail('not-found');
    const inspection = inspectSandboxText(text);
    if (!inspection.ok) return fail(inspection.code);
    const now = this.#deps.clock.now();
    if (isReserved) {
      this.#deps.store.sessions.insert({
        id,
        workspaceId: this.workspaceId,
        baseRevisionId: this.currentRevisionId,
        createdAt: now,
        updatedAt: now,
        label: defaultLabel(inspection.summary.componentCount),
        sandbox: text,
      });
      this.#current = { id, persisted: true };
    } else {
      this.#deps.store.sessions.update(this.workspaceId, id, { sandbox: text, updatedAt: now });
    }
    return this.#summaryById(id);
  }

  rename(id: string, label: string): ServiceResult<SessionSummary> {
    if (!this.#deps.store.sessions.get(this.workspaceId, id)) return fail('not-found');
    if (!isValidLabel(label) || containsSecretPattern(label)) return fail('invalid-label');
    this.#deps.store.sessions.update(this.workspaceId, id, {
      label,
      updatedAt: this.#deps.clock.now(),
    });
    return this.#summaryById(id);
  }

  delete(id: string): ServiceResult<null> {
    if (!this.#deps.store.sessions.delete(this.workspaceId, id)) return fail('not-found');
    if (id === this.#current.id) {
      this.#current = { id: this.#deps.ids.next('ses'), persisted: false };
    }
    return { ok: true, value: null };
  }

  #summaryById(id: string): ServiceResult<SessionSummary> {
    const session = this.#deps.store.sessions.get(this.workspaceId, id);
    return session ? { ok: true, value: this.#summary(session) } : fail('not-found');
  }

  #summary(session: StoredSession): SessionSummary {
    const inspection = inspectSandboxText(session.sandbox);
    const summary = inspection.ok ? inspection.summary : { componentCount: 0, hasSnapshots: false };
    return {
      id: session.id,
      label: session.label,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      componentCount: summary.componentCount,
      hasSnapshots: summary.hasSnapshots,
      baseIsCurrent: session.baseRevisionId === this.currentRevisionId,
    };
  }

  #detail(session: StoredSession, base: StoredRevision): SessionDetail {
    return { ...this.#summary(session), sandbox: session.sandbox, view: base.view };
  }
}
