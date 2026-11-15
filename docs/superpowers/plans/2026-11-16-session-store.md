# Session Store (Phase 2, slice 2 — PR 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist discovered graph revisions and Sandbox sessions in a local SQLite store, behind application ports. Expose them through the protected loopback API and `archwise --sessions`. The Studio UI is PR 2.

**Architecture:**
- `@archwise/application` gains:
  - ports: `WorkspaceRepository`, `RevisionRepository`, `SessionRepository`, `Clock`, `IdGenerator`, `Digest`;
  - use cases, collected in a `SessionService`;
  - an in-memory adapter;
  - a reusable contract suite exported from `@archwise/application/testing`.
- A new `@archwise/storage` package implements the ports with `node:sqlite`. It owns migrations, backup, quarantine and data-directory resolution.
- `apps/cli` provides three pieces:
  - a revision adapter that builds an `archwise.graph` revision from the existing inventory and graph;
  - the composition in `bin.ts`;
  - new `/api/v1/sessions*` routes in `local-server.ts`.

**Tech Stack:** TypeScript strict ESM, `node:sqlite` (`DatabaseSync`, `backup`), `node:crypto` (in adapters only), Vitest 5. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-11-16-sessions-and-local-store-design.md` (approved 2026-11-16). Builds on `docs/superpowers/specs/2026-11-11-graph-contracts-design.md`.

## Global Constraints

- **Package boundaries:** `application` imports only `@archwise/domain` and `@archwise/schemas`. `storage` imports `application`, `domain`, `schemas` and `node:*`. Neither `domain` nor `application` imports `node:*`.
- **Data location:**
  - macOS: `~/Library/Application Support/Archwise`
  - Linux: `$XDG_DATA_HOME/archwise`, else `~/.local/share/archwise`
  - Windows: `%LOCALAPPDATA%\Archwise`
  - `ARCHWISE_DATA_DIR` overrides all of these.
  - The directory has mode `0700` on POSIX, and the file is `archwise.db`.
  - Nothing is ever written inside the analyzed root.
- **IDs:** opaque, with prefixes `ws-`, `rev-` and `ses-` followed by 24 lowercase hex characters (random). They must be domain-valid IDs.
- **Sandbox documents:**
  - stored as JSON text, at most 262,144 bytes in UTF-8;
  - the server checks only that the text is a JSON object with `format: "archwise-sandbox"` and `version: 1`, and that it is within the size limit;
  - `nodes` must be an array, used for the component count;
  - snapshots are detected from `draft.savedA` / `draft.savedB` being non-null.
- **Revision fingerprint:** SHA-256 hex of `serializeGraphRevision` output for a copy whose `id`, `createdAt` and `parentRevisionId` are replaced by fixed placeholders (`rev-fingerprint`, `1970-01-01T00:00:00.000Z`, `null`).
- **API:**
  - Every new route sits under `/api/v1/sessions` behind the existing capability check.
  - Mutating methods (`PUT`, `PATCH`, `DELETE`) also require an `Origin` header equal to the server origin, plus `Content-Type: application/json` for bodies.
  - Bodies are limited to 300,000 bytes.
  - Responses never contain absolute paths or echo rejected input.
  - Unknown IDs return `404 {"error":"Not found"}`.
- **Store failures:**
  - **Corrupt file** (integrity check fails or open throws a SQLite corruption error): rename it to `archwise.db.corrupt-<ISO timestamp with ':' replaced by '-'>` and create a fresh store.
  - **Newer schema, failed migration, or unwritable directory:** throw a `StoreUnavailableError` with a `reason` of `newer-schema`, `migration-failed` or `unwritable`. The CLI exits with code 2 and leaves the file untouched.
  - `--no-store` skips the store entirely.
- **Commits:** signed off (`git commit -s`), each ending with the Co-Authored-By attribution line. Run pnpm as `npx --yes pnpm@10.34.9`.

## Review Focus

1. **The analyzed directory must stay byte-identical.** Running `--serve` with the store enabled, against a fixture directory, must not create `archwise.db` or any other file inside that directory (owner: Task 5 integration test).
2. **A resumed session's revision must be the one it started from.** Saving a resumed session must never change its `baseRevisionId`, even after a newer discovery revision exists (owner: Task 1 contract suite).
3. **Two processes on one database file.** Interleaved saves through two `openStore` handles on the same file must both succeed (thanks to the busy timeout) without `SQLITE_BUSY` surfacing (owner: Task 2).
4. **Sandbox text that is valid JSON but hostile.** A body like `{"format":"archwise-sandbox","version":1,"nodes":{}}`, or one with a `__proto__` key, must be rejected with `invalid-sandbox` and must not throw (owner: Task 1).
5. **A path-like session ID in the URL.** `/api/v1/sessions/..%2F..%2Fetc` and IDs longer than 128 characters must return 404 without echoing the ID (owner: Task 4).

---

### Task 1: Application ports, `SessionService`, in-memory adapter and contract suite

**Files:**
- Create:
  - `packages/application/src/ports.ts`
  - `packages/application/src/sandbox-text.ts`
  - `packages/application/src/session-service.ts`
  - `packages/application/src/memory-store.ts`
  - `packages/application/src/testing/store-contract.ts`
  - `packages/application/src/testing/index.ts`
- Modify:
  - `packages/application/src/index.ts`, to re-export the new modules (keep `createApplicationInfo`);
  - `packages/application/package.json`, adding `"./testing"` to `exports` (built `dist/testing/index.js`) and `"@archwise/schemas": "workspace:*"`.
- Test:
  - `packages/application/tests/sandbox-text.test.ts`
  - `packages/application/tests/session-service.test.ts`
  - `packages/application/tests/memory-store.contract.test.ts`

**Interfaces — Produces:**

```ts
// ports.ts
export interface Workspace { readonly id: string; readonly rootPath: string; readonly createdAt: string }
export interface StoredRevision { readonly id: string; readonly workspaceId: string; readonly fingerprint: string;
  readonly createdAt: string; readonly revision: GraphRevision; readonly view: string /* ArchitectureGraph JSON */ }
export interface StoredSession { readonly id: string; readonly workspaceId: string; readonly baseRevisionId: string;
  readonly createdAt: string; readonly updatedAt: string; readonly label: string; readonly sandbox: string }
export interface WorkspaceRepository { resolve(rootPath: string, id: string, createdAt: string): Workspace } // returns existing row for rootPath, or inserts with given id
export interface RevisionRepository {
  latest(workspaceId: string): StoredRevision | null;
  get(workspaceId: string, id: string): StoredRevision | null;
  insert(revision: StoredRevision): void;
}
export interface SessionRepository {
  get(workspaceId: string, id: string): StoredSession | null;
  list(workspaceId: string): readonly StoredSession[];            // updatedAt desc, then id asc
  insert(session: StoredSession): void;
  update(workspaceId: string, id: string, changes: { readonly sandbox?: string; readonly label?: string; readonly updatedAt: string }): boolean;
  delete(workspaceId: string, id: string): boolean;
}
export interface Store { readonly workspaces: WorkspaceRepository; readonly revisions: RevisionRepository; readonly sessions: SessionRepository }
export interface Clock { now(): string }                             // domain timestamp format
export interface IdGenerator { next(prefix: 'ws' | 'rev' | 'ses'): string }
export interface Digest { sha256Hex(text: string): string }

// sandbox-text.ts
export const MAX_SANDBOX_BYTES = 262_144;
export interface SandboxSummary { readonly componentCount: number; readonly hasSnapshots: boolean }
export function inspectSandboxText(text: string): { ok: true; summary: SandboxSummary } | { ok: false; code: 'too-large' | 'invalid-sandbox' };

// session-service.ts
export interface SessionSummary { readonly id: string; readonly label: string; readonly createdAt: string; readonly updatedAt: string;
  readonly componentCount: number; readonly hasSnapshots: boolean; readonly baseIsCurrent: boolean }
export interface SessionDetail extends SessionSummary { readonly sandbox: string; readonly view: string }
export type ServiceError = 'not-found' | 'too-large' | 'invalid-sandbox' | 'invalid-label';
export type ServiceResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ServiceError };
export interface DiscoveryInput { readonly rootPath: string; readonly view: string;
  readonly build: (ids: { revisionId: string; workspaceId: string; parentRevisionId: string | null; createdAt: string }) => GraphRevision }
export class SessionService {
  static open(deps: { store: Store; clock: Clock; ids: IdGenerator; digest: Digest }, discovery: DiscoveryInput): ServiceResult<SessionService>; // 'invalid-sandbox' never; validation failure of build() → throws RevisionInvalidError
  readonly workspaceId: string;
  readonly currentRevisionId: string;
  current(): { readonly id: string; readonly persisted: boolean };
  list(): readonly SessionSummary[];
  get(id: string): ServiceResult<SessionDetail>;   // reserved-but-unpersisted id → not-found
  resume(id: string): ServiceResult<SessionDetail>; // makes it current
  saveSandbox(id: string, text: string): ServiceResult<SessionSummary>; // id must be current (reserved or persisted) or a persisted id; first save of reserved id persists it
  rename(id: string, label: string): ServiceResult<SessionSummary>;      // label must pass domain isValidLabel and !containsSecretPattern
  delete(id: string): ServiceResult<null>;          // deleting the current session reserves a fresh one
}
export class RevisionInvalidError extends Error { readonly issues: readonly ValidationIssue[] }

// memory-store.ts
export function createMemoryStore(): Store;

// testing/store-contract.ts — framework-agnostic: caller injects test + expect
export function defineStoreContract(name: string, factory: () => { store: Store; dispose(): void },
  t: { test: (name: string, fn: () => void) => void; expect: (v: unknown) => any }): void;
```

`SessionService.open` steps:
1. `workspaces.resolve(rootPath, ids.next('ws'), clock.now())`.
2. `latest = revisions.latest(ws)`.
3. `revision = createRevision(build({revisionId: ids.next('rev'), workspaceId, parentRevisionId: latest?.id ?? null, createdAt: clock.now()}))`. If this fails, throw `RevisionInvalidError`.
4. Compute the fingerprint as described in Global Constraints.
5. If it equals `latest.fingerprint`, reuse `latest` (do not insert). Otherwise insert a new revision with `view`.
6. Reserve `ids.next('ses')` as current, not persisted.

The default label on first persist is `` `Sandbox · ${n} component${n === 1 ? '' : 's'}` ``. `baseIsCurrent` is `session.baseRevisionId === currentRevisionId`. A session's `view` is its base revision's `view`.

- [ ] **Step 1: Write failing tests.**
  - `sandbox-text.test.ts`:
    - A minimal valid doc `{"format":"archwise-sandbox","version":1,"nodes":[{}],"draft":{"savedA":null,"savedB":{}}}` gives `{componentCount:1, hasSnapshots:true}`.
    - Each of these gives `invalid-sandbox` (and never throws): non-JSON; a JSON array; the wrong `format`; `version: 2`; `nodes: {}`; a missing or non-object `draft`.
    - **Review Focus 4:** `{"__proto__":{}}` gives `invalid-sandbox`.
    - 262,145 bytes of padding gives `too-large`.
  - `memory-store.contract.test.ts`: `defineStoreContract('memory', () => ({ store: createMemoryStore(), dispose() {} }), { test, expect })`.
  - The contract suite in `store-contract.ts` covers:
    - `resolve` is idempotent per `rootPath`, and two different roots give different workspaces.
    - Revision `insert`/`get`/`latest` round-trip, and `get` with another workspace's ID returns `null`.
    - Session `insert`/`get`/`list` ordering, `update` returning `false` for unknown IDs, `delete`, and workspace isolation.
  - `session-service.test.ts` uses a fake clock with incrementing ISO seconds, sequential IDs (`ses-000…001`) and `digest` = identity:
    - Two `open`s with an unchanged `build` produce one revision row.
    - A changed `build` produces a second revision whose parent is the first.
    - With no `saveSandbox`, `list()` is empty.
    - The first `saveSandbox(current().id, doc)` persists the session with label `Sandbox · 1 component`.
    - `get` of the reserved ID before saving gives `not-found`.
    - **Review Focus 2:** resuming an old session after a newer revision gives `baseIsCurrent: false`, and a later `saveSandbox` keeps its `baseRevisionId`.
    - `rename` to `''` gives `invalid-label`.
    - `delete(current)` reserves a new current ID.
    - An unknown ID gives `not-found` for `get`, `resume`, `rename` and `delete`.
    - A `build` that produces an invalid revision makes `open` throw `RevisionInvalidError`.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 install --ignore-scripts && npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/application test`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the files above. The memory store keeps `Map`s and returns frozen copies.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then run `npx --yes pnpm@10.34.9 lint && npx --yes pnpm@10.34.9 boundaries`. Expected: clean.
- [ ] **Step 5:** Commit with `feat(application): session service, store ports and contract suite`. Include `pnpm-lock.yaml`.

### Task 2: `@archwise/storage` SQLite adapter

**Files:**
- Create:
  - `packages/storage/package.json`, named `@archwise/storage`, private, ESM. Its dependencies are `@archwise/application`, `@archwise/domain` and `@archwise/schemas`, all `workspace:*`.
  - `tsconfig.json`, `tsconfig.check.json` and `vitest.config.ts`, mirroring `packages/application`.
  - `README.md`
  - `src/index.ts`, `src/data-dir.ts`, `src/migrations.ts` and `src/sqlite-store.ts`
- Modify: `.dependency-cruiser.mjs`. Add a rule `storage-inward-only`: from `^packages/storage/src/`, imports may target only `^packages/(storage|application|domain|schemas)/` and core Node modules.
- Test:
  - `packages/storage/tests/sqlite.contract.test.ts`
  - `packages/storage/tests/lifecycle.test.ts`
  - `packages/storage/tests/data-dir.test.ts`

**Interfaces — Consumes:** `Store`, the repository ports, `StoredRevision` and `StoredSession` (Task 1); `defineStoreContract` from `@archwise/application/testing`; `serializeGraphRevision` and `importGraphJson` from schemas.

**Interfaces — Produces:**

```ts
export function resolveDataDir(env: Readonly<Record<string, string | undefined>>, platform: NodeJS.Platform, home: string): string;
export class StoreUnavailableError extends Error { readonly reason: 'newer-schema' | 'migration-failed' | 'unwritable' }
export interface OpenedStore extends Store { readonly path: string; readonly quarantinedPath: string | null; readonly backupPath: string | null; close(): void }
export function openStore(dataDir: string, options?: { readonly now?: () => Date; readonly migrations?: readonly { version: number; sql: string }[] }): Promise<OpenedStore>; // async because node:sqlite backup() is async
export const SCHEMA_VERSION = 1;
export const MIGRATIONS: readonly { readonly version: number; readonly sql: string }[];
```

Schema v1 has the following tables:
- `schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)`
- `workspaces(id TEXT PRIMARY KEY, root_path TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL)`
- `revisions(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, document TEXT NOT NULL, view_document TEXT NOT NULL)`, with an index on `(workspace_id, created_at)`
- `sessions(id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), base_revision_id TEXT NOT NULL REFERENCES revisions(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, label TEXT NOT NULL, sandbox_document TEXT NOT NULL)`, with an index on `(workspace_id, updated_at)`

Revisions are stored as `serializeGraphRevision` text and read back through `importGraphJson`. If a stored row fails to import, `get` and `latest` return `null`. `latest` orders by `created_at DESC, id DESC`.

`openStore` performs these steps in order:
1. `mkdirSync(dataDir, {recursive: true, mode: 0o700})`. An error here becomes `unwritable`.
2. If the file exists:
   - Open it and run `PRAGMA integrity_check`. If the result is not `ok`, or the open throws `SQLITE_CORRUPT`/`SQLITE_NOTADB`, close it, rename it to the quarantine name, and continue with a fresh file. Record `quarantinedPath`.
   - Read `MAX(version)` from `schema_migrations`. If the table is missing, treat the version as 0. If the version is greater than `SCHEMA_VERSION`, close and throw `newer-schema`.
   - If the version is below `SCHEMA_VERSION` and the file is non-empty with version ≥ 1, run `backup(db, \`${path}.backup-v${version}-${stamp}\`)` first, keep the 3 newest backups, and record `backupPath`.
3. Set `PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON`.
4. Apply the pending migrations inside one `BEGIN IMMEDIATE … COMMIT` transaction. On any error, roll back, close, and throw `migration-failed`.

`openStore` is async because `node:sqlite`'s `backup()` is async.

- [ ] **Step 1: Write failing tests.**
  - `sqlite.contract.test.ts` runs `defineStoreContract('sqlite', …)` against a temporary directory created with `mkdtempSync(join(tmpdir(), 'archwise-store-'))`.
  - `lifecycle.test.ts` covers:
    - A fresh open creates `archwise.db` with `schema_migrations` at version 1.
    - Reopening does not create a backup.
    - A v0 file (a hand-created database without `schema_migrations` that holds a table `legacy`) gets a backup file, and the backup still contains `legacy`.
    - A database with `schema_migrations` version 99 throws `newer-schema`, and its bytes are unchanged.
    - A file of 4 KiB of `0x00`/text garbage is quarantined: `quarantinedPath` exists and the new store works.
    - A migration list with a failing SQL statement throws `migration-failed` and leaves the file bytes unchanged. Inject it with `openStore(dir, { migrations: [...] })`; add `migrations?` to the options for tests.
    - A non-writable data directory (POSIX only; skip on win32) throws `unwritable`.
    - **Review Focus 3:** two `openStore` handles on the same directory perform 50 alternating `sessions.update` calls, all of which succeed.
  - `data-dir.test.ts` covers the three platforms, `XDG_DATA_HOME`, and the `ARCHWISE_DATA_DIR` override.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 install --ignore-scripts && npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/storage test`. Expected: FAIL.
- [ ] **Step 3:** Implement the package and the boundary rule.
- [ ] **Step 4:** Run the same command, then `npx --yes pnpm@10.34.9 boundaries`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(storage): SQLite session store with migrations and recovery`.

### Task 3: CLI revision adapter

**Files:**
- Create: `apps/cli/src/revision.ts`
- Modify: `apps/cli/package.json`, adding the dependencies `@archwise/domain`, `@archwise/schemas`, `@archwise/application` and `@archwise/storage`, all `workspace:*`.
- Test: `apps/cli/tests/revision.test.ts`

**Interfaces — Produces:**

```ts
export const MANIFEST_ANALYZER = { id: 'node-manifest', version: '1.0.0' } as const;
export function buildGraphRevision(graph: ArchitectureGraph, rootLabel: string,
  ids: { revisionId: string; workspaceId: string; parentRevisionId: string | null; createdAt: string }): GraphRevision;
```

Mapping rules:
- **Repository:** one repository, `repo-root`, labelled with `rootLabel` (the root directory's base name, trimmed to 256 code points).
- **Nodes and edges:**
  - Each view node becomes a `module` node with ID `` `mod-${sha256(path).slice(0, 16)}` `` and confidence `{observed, ['manifest-declared']}`, plus evidence `` `ev-${sha256('manifest:' + path).slice(0, 16)}` `` with `ruleId: 'package-manifest'`.
  - Each view edge becomes a `depends-on` edge with ID `` `dep-${sha256(edge.id).slice(0, 16)}` `` and confidence `{observed, ['dependency-declared']}`, plus evidence `` `ev-${sha256('dependency:' + path).slice(0, 16)}` `` with `ruleId: 'package-dependency'`.
- **Coverage:** `MANIFEST_ANALYZER` for `repo-root`. It is `complete` when the graph has no diagnostics, `partial` otherwise. The revision `status` matches.
- **Diagnostics:** one diagnostic per category present. `Ambiguous package name…` maps to `ambiguous-package-name`, `Unresolved dependency…` to `unresolved-dependency`, and anything else to `inventory-warning`. Each has severity `warning`, ID `diag-<code>` and no references.

- [ ] **Step 1: Write failing tests.**
  - A three-package fixture graph with one edge and one ambiguity diagnostic gives `createRevision(...).ok === true`, status `partial`, and diagnostic codes `['ambiguous-package-name']`.
  - Node IDs are stable across calls and pass `isValidId`.
  - An empty graph gives a valid `complete` revision.
  - **Determinism:** `serializeGraphRevision` is equal for two calls with the same IDs.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 install --ignore-scripts && npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/cli test`. Expected: FAIL.
- [ ] **Step 3:** Implement `revision.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(cli): map discovered package graph to archwise.graph revisions`. Include the lockfile.

### Task 4: Session API routes in the loopback server

**Files:**
- Modify: `apps/cli/src/local-server.ts`. Add `sessions?: SessionService | null` to `ServerOptions`, and allow `PUT`, `PATCH` and `DELETE` only on session routes.
- Test: `apps/cli/tests/session-api.test.ts`

**Interfaces — Consumes:** `SessionService` (Task 1).

**Routes:** all are authorized, and none accepts query strings.

| Method and route | Response |
|---|---|
| `GET /api/v1/sessions/current` | `{id, persisted, storeEnabled: true}`. Without a service: `{id: null, persisted: false, storeEnabled: false}`. |
| `GET /api/v1/sessions` | `{sessions: SessionSummary[]}`. Without a service: 404. |
| `GET /api/v1/sessions/{id}` | `SessionDetail`, with `view` parsed into an object and `sandbox` returned as a string. |
| `POST /api/v1/sessions/{id}/resume` | `SessionDetail` |
| `PUT /api/v1/sessions/{id}/sandbox` | Body is the raw Sandbox JSON text. Returns `SessionSummary`. |
| `PATCH /api/v1/sessions/{id}` | Body `{label}`. Returns `SessionSummary`. |
| `DELETE /api/v1/sessions/{id}` | `204` |

Error mapping:
- **IDs:** an ID is accepted only if it matches `^ses-[0-9a-f]{24}$`. Anything else returns 404.
- **Service errors:** `not-found` → 404, `too-large` → 413, `invalid-sandbox` and `invalid-label` → 422, each with `{error: <code>}`.
- **Bodies:** a body over 300,000 bytes → 413. A missing or foreign `Origin` on a mutating method → 403. A wrong content type → 415.

- [ ] **Step 1: Write failing tests** using a `SessionService` over `createMemoryStore()`, reusing the bootstrap-cookie helper pattern from `local-server.test.ts`:
  - Without auth, every route returns 401.
  - `current` returns a reserved, unpersisted ID.
  - `PUT` to that ID with a valid document returns 200 and makes the session appear in the list.
  - `GET` of the session returns its sandbox.
  - `PATCH` renames it, and a bad label returns 422.
  - `DELETE` returns 204, and a later `GET` returns 404.
  - Resuming switches `current`.
  - `PUT` without `Origin` returns 403.
  - `PUT` with `text/plain` returns 415.
  - `PUT` with 300,001 bytes returns 413.
  - **Review Focus 5:** `/api/v1/sessions/..%2F..%2Fetc` and a 200-character ID return 404, and the response body does not contain the ID.
  - Without a service, `current` reports `storeEnabled: false` and the list returns 404.
  - The existing `/api/v1/graph` behavior is unchanged: the existing tests still pass.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/cli test`. Expected: FAIL.
- [ ] **Step 3:** Implement the routes. Read the body with a streaming byte counter that aborts past the limit.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(cli): protected session API on the loopback server`.

### Task 5: CLI composition, `--sessions`, `--no-store`, and docs

**Files:**
- Modify:
  - `apps/cli/src/index.ts`: parse `--sessions` (exclusive with `--json`, `--graph` and `--serve`) and `--no-store` (only valid with `--serve`), and update the help text.
  - `apps/cli/src/bin.ts`: compose `openStore(resolveDataDir(process.env, process.platform, homedir()))`, `SessionService.open`, and the server.
- Create: `apps/cli/src/store-runtime.ts`, a small composition helper that is testable without `bin.ts`.
- Test:
  - `apps/cli/tests/cli.test.ts` (extend for parsing)
  - `scripts/tests/session-store-integration.test.mjs` (built CLI, `ARCHWISE_DATA_DIR` set to a temporary directory)
- Docs:
  - Create `docs/decisions/0006-local-store-node-sqlite.md`, covering the decision, location, alternatives (`better-sqlite3`, JSON files, IndexedDB) and consequences.
  - Create `docs/sessions.md`, a user guide for the store, `--sessions`, `--no-store`, recovery behavior, data location and deleting data. It must say the Studio UI arrives in PR 2.
  - Update the README documentation map; `docs/implementation-roadmap.md` (Phase 2 status and the current-state table: storage, ports and migrations are done; export redaction of home paths is still open); `docs/architecture.md` (the Local persistence section now describes what is implemented); `docs/security.md` (store contents, location and permissions); `docs/alpha-testing.md` (mention `--sessions` and `--no-store`); `docs/code-organization.md` (`storage` package now exists); the `apps/cli` and `packages/application` READMEs; and `.changeset/session-store.md`.

**Interfaces — Produces:**

```ts
// store-runtime.ts
export type StoreRuntime =
  | { readonly kind: 'disabled' }
  | { readonly kind: 'ready'; readonly service: SessionService; readonly store: OpenedStore; readonly notices: readonly string[] };
export async function prepareStore(options: { readonly enabled: boolean; readonly dataDir: string; readonly rootPath: string;
  readonly rootLabel: string; readonly graph: ArchitectureGraph }): Promise<StoreRuntime>; // throws StoreUnavailableError
```

`--sessions` prints one line per session with the time last changed, its label, its component count, `A/B` if it has snapshots, `changed` if `baseIsCurrent` is false, and its ID. With no sessions it prints `No saved sessions for this project.` and exits 0.

Store notices:
- After quarantine: `Store file was corrupt; moved to <path>. Started a fresh store.`
- After a backup: `Store migrated; backup at <path>.`

`StoreUnavailableError` produces exit code 2 and one actionable line per reason:
- **newer-schema:** upgrade Archwise or use `--no-store`.
- **migration-failed:** the file is unchanged; report a bug; use `--no-store`.
- **unwritable:** fix the permissions of `<dir>`, or set `ARCHWISE_DATA_DIR`.

- [ ] **Step 1: Write failing tests.**
  - `cli.test.ts`:
    - `--sessions` parses.
    - `--sessions --serve` returns exit code 2.
    - `--no-store` without `--serve` returns exit code 2.
    - `--help` mentions `--sessions` and `--no-store`.
  - `session-store-integration.test.mjs` uses a synthetic fixture tree and a temporary data directory:
    - A first `--sessions` prints `No saved sessions`.
    - A `--serve --no-open` process is started and the test bootstraps the cookie. `PUT` to the current session, then kill the process.
    - A second `--sessions` lists one session.
    - **Review Focus 1:** before and after, the fixture tree contains identical relative paths and bytes, and the data directory contains `archwise.db`.
    - Running with `ARCHWISE_DATA_DIR` pointing at a file (so it is unwritable) makes `--serve` exit 2 with a message mentioning `ARCHWISE_DATA_DIR`.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/cli test && node --test scripts/tests/session-store-integration.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement the parsing, `store-runtime.ts` and the `bin.ts` wiring, then write the docs listed above. Every statement in the docs must match the delivered behavior: the session UI is PR 2.
- [ ] **Step 4:** Run `npx --yes pnpm@10.34.9 check`. Expected: everything passes.
- [ ] **Step 5:** Run a relative-link check over all `*.md` files (the same script as PR #8). Expected: all links resolve.
- [ ] **Step 6:** Commit with `feat(cli): persist sessions locally with --sessions and --no-store`, then push and open a PR against `main`, wait for all required checks, and merge.
