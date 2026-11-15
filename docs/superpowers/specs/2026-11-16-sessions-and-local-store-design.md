# Sessions and local store: second Phase 2 slice

Status: approved by the owner on 2026-11-16. Builder-check questions are resolved below as Claude's calls.

## Intent

The owner's words: *start fresh, but with a way to recover previous sessions, like `/resume`*.

Every launch of Archwise on a project opens a clean session. Everything the user does in it is saved automatically and locally. A session list lets the user resume any earlier session exactly as it was. Losing a carefully built Sandbox must never happen silently. That is the failure this slice exists to prevent.

The slice also delivers the Phase 2 persistence work in the roadmap: application ports, a SQLite adapter, transactional migrations, backup and corruption recovery. It does so through a feature a person actually uses, instead of storage built for its own sake.

## Goals

1. **A fresh session on each launch.** Each `--serve` launch starts a new session based on the graph revision discovered now, with an empty Sandbox.
2. **Automatic saving.** Sandbox changes autosave to the local store. The user never has to export to keep their work.
3. **Listing and resuming sessions.**
   - The Studio lists previous sessions for the same project, newest first. Each entry shows when it was last changed, its label, the number of proposed components, whether A/B snapshots exist, and whether the discovered architecture changed since the session began.
   - Resuming a session restores its Sandbox and shows **the graph revision it was based on, unchanged**. When that revision differs from the current discovery, a visible notice says so.
4. **CLI parity.** `archwise --sessions` lists the sessions; `archwise --serve --resume <id|latest>` opens the Studio on that session.
5. **Persisted revisions.** Discovered graphs are stored as validated `archwise.graph` v1 revisions (the contracts from slice 1). An unchanged rescan reuses the latest revision instead of duplicating it.
6. **Store lifecycle.** The store has transactional migrations, a backup before every migration, an integrity check on open with quarantine of a corrupt file, and safe concurrent access by two Archwise processes.

## Non-goals

- Rebasing an old Sandbox onto a newer revision. Rebase, conflicts and operation logs are Phase 7. A resumed session only shows a notice.
- A revision history browser, file watching or incremental rescans (Phase 6).
- Syncing or exporting sessions anywhere. The existing Sandbox JSON export/import stays as the portable path.
- Automatic pruning of old sessions. Users may delete a session explicitly.
- Changing the `archwise-sandbox` v1 document format.

## Anti-goals

These would make the slice a failure even if it works:

- **Writing anything inside the analyzed repository.** The store lives only in the user's application-data directory.
- **A session list cluttered with empty sessions.** A session is persisted only after its first Sandbox change. Launches where the user changed nothing leave no trace.
- **A resumed session that silently shows today's graph under yesterday's Sandbox.**
- **Losing data on migration failure or a corrupt file.** Recovery keeps the old file. It never deletes it.
- **Absolute paths or store contents leaving the machine** through exports, logs or API responses.

## Constraints

- **`node:sqlite`** (built into Node, verified on 24.22 and 26.4 without flags or warnings). No new npm dependency.
- **Package boundaries** (AGENTS.md):
  - `packages/application` defines ports and use cases and depends only on domain and schemas.
  - A new `packages/storage` implements the ports with SQLite.
  - `apps/cli` composes the pieces.
  - `domain` stays pure.
- **Store location:**
  - macOS: `~/Library/Application Support/Archwise`
  - Linux: `$XDG_DATA_HOME/archwise`, else `~/.local/share/archwise`
  - Windows: `%LOCALAPPDATA%\Archwise`
  - `ARCHWISE_DATA_DIR` overrides the location (used by tests).
  - The directory is created with mode `0700` on POSIX.
- **Workspace identity:** the canonical absolute root path, stored locally only. The browser receives opaque workspace and session IDs and never a path.
- **Loopback API rules stay unchanged:** session capability token, origin checks and request-size limits. New endpoints are versioned under `/api/v1/`.
- **Sandbox documents** are stored as the existing `archwise-sandbox` v1 JSON:
  - limited to 256 KiB;
  - the server checks it is JSON with the expected `format` and `version` and within the size limit;
  - the web app performs full validation before applying it, as its import path does today.

## Decisions taken in this design

All are Claude's calls; the owner can override any of them.

- **One database file**, `archwise.db`, holds all workspaces. It uses WAL journaling, a 5-second busy timeout and foreign keys.
- **Tables:**
  - `schema_migrations(version, applied_at)`
  - `workspaces(id, root_path UNIQUE, created_at)`
  - `revisions(id, workspace_id, fingerprint, created_at, document, view_document)`.
    - `document` is the canonical `archwise.graph` JSON: the evidence record.
    - `view_document` is the Studio's existing `ArchitectureGraph` JSON produced by the same discovery run (see the next section).
    - The fingerprint is a SHA-256 of the canonical JSON with `id`, `createdAt` and `parentRevisionId` removed, so an unchanged rescan matches and deduplicates.
    - A new revision's parent is the workspace's latest revision.
  - `sessions(id, workspace_id, base_revision_id, created_at, updated_at, label, sandbox_document)`
- **IDs** are random, prefixed and opaque (`ws-`, `rev-`, `ses-`), created behind the application `IdGenerator` port. Time comes from a `Clock` port.
- **Revisions come from the existing CLI package graph** through a new adapter:
  - each package becomes a `module` node;
  - each declared internal dependency becomes a `depends-on` edge;
  - the evidence is the package's relative `package.json` path;
  - coverage is the manifest analyzer.
  This is the first real use of the slice-1 contracts.
- **What the Studio renders.** The Studio keeps rendering its existing `ArchitectureGraph` view. Each revision stores that view next to the canonical document, and a resumed session receives its base revision's stored view. This keeps several things unchanged:
  - the current UI, framework labels and diagnostic text;
  - the Sandbox `projectSignature`;
  - compatibility with existing Sandbox JSON exports;
  - the output of `/api/v1/graph` and `--graph`.

  Moving the web to render `archwise.graph` directly is Phase 5 work, tracked with the ADR 0005 debt. Revision node IDs are new domain-valid IDs derived deterministically from the package's relative manifest path. The view keeps its existing IDs.
- **Session lifecycle** (mirrors `/resume`):
  - At launch the server reserves a session ID for the new session but does not persist it. The web receives it from `GET /api/v1/sessions/current`.
  - The first `PUT .../sandbox` to that reserved ID creates the persisted session. Before that, `GET` and `DELETE` on the reserved ID return 404.
  - Resuming continues the same session **in place**: later saves update it and bump `updated_at`, like continuing a conversation. Resume is triggered from the session list or with `--resume`. It makes that session the current one for this server, and `GET .../current` returns it.
  - When two processes save the same session, the last write wins.
- **Default label**, for example `Sandbox · 3 components`. Renaming is allowed. Labels follow the domain label rules.
- **Autosave:**
  - The web app debounces saves (about 750 ms) to `PUT /api/v1/sessions/{id}/sandbox`.
  - The first save creates the persisted session.
  - Save failures show a visible, non-blocking "not saved" indicator and are retried. The in-memory Sandbox is never discarded.
- **Browser `localStorage` is retired for Sandbox state.** It is not migrated automatically, because each launch binds a random port and therefore a new browser origin, so earlier launches' storage is unreachable. Users with old Sandboxes use the existing JSON export and import. The docs say so.
- **Migration safety:**
  - Before running migrations on an existing file, `node:sqlite` `backup()` copies it to `archwise.db.backup-v<from>-<timestamp>`, keeping the three newest copies.
  - Migrations run in one transaction.
  - A database whose schema version is newer than the running Archwise refuses to open and prints an actionable message. It is not modified.
- **Corruption recovery:**
  - `PRAGMA integrity_check` runs on open.
  - A failing file is renamed to `archwise.db.corrupt-<timestamp>`, and a fresh store is created.
  - The CLI prints where the old file is.
  - Archwise still starts, because the store is non-essential to inspection.
- **Other store failures exit with an actionable message (exit code 2) and change nothing.** These are a newer-schema file, a failed migration (rolled back, backup kept) and an unwritable data directory. `--no-store` explicitly runs without sessions (no autosave, no session list), and the Studio shows that state. `--sessions` follows the same rules.
- **Node runtime:** `node:sqlite` is available without flags on every Node 24 and 26 release, so `engines` stays unchanged. Early 24.x releases may print an experimental warning, which is acceptable. CI runs the latest 24 and 26.
- **Session deletion** is explicit, from the session list, with a confirmation step.

## Interfaces the builder must honor

- **`packages/application` ports:**
  - `RevisionRepository`: `saveIfChanged(workspaceId, revision)`, `get(id)`, `latest(workspaceId)`
  - `SessionRepository`: `create`, `get`, `list(workspaceId)`, `saveSandbox`, `rename`, `delete`
  - `WorkspaceRepository`: `resolve(rootPath)`
  - `Clock`
  - `IdGenerator`
- **`packages/application` use cases:** `recordDiscovery`, `startSession`, `listSessions`, `resumeSession`, `saveSandbox`, `deleteSession`.
- **Contract tests:** one shared suite runs against an in-memory adapter (in application tests) and the SQLite adapter (in storage tests).
- **API, all behind the existing session capability:**
  - `GET /api/v1/sessions/current`: the current (reserved or resumed) session ID and whether the store is enabled.
  - `GET /api/v1/sessions`: list for the current workspace.
  - `GET /api/v1/sessions/{id}`: session, base revision graph and the `baseIsCurrent` flag.
  - `PUT /api/v1/sessions/{id}/sandbox`
  - `PATCH /api/v1/sessions/{id}`: rename.
  - `DELETE /api/v1/sessions/{id}`
  - The existing graph endpoint keeps working.

## Acceptance

- Two launches with no Sandbox change leave zero persisted sessions.
- **Build, quit, relaunch, resume:**
  1. Build a Sandbox with A/B snapshots.
  2. Quit and relaunch: the Sandbox is empty.
  3. Resume: identical components, positions, parameters and snapshots.
  4. This is covered in the real-browser smoke test.
- After changing a fixture manifest, a resumed session shows its original graph and the "architecture changed" notice. A new launch shows the new graph.
- An unchanged rescan does not add a revision row.
- **Migrations:**
  - A backup file exists after a migration.
  - A failing migration leaves the original file unchanged.
  - A newer-schema file is refused untouched.
- A corrupted file is quarantined and Archwise starts with a fresh store.
- Two processes saving concurrently do not corrupt the store.
- The analyzed fixture directory is byte-identical before and after all tests.
- API responses contain no absolute paths, and unknown session IDs return 404 without echoing input.
- `pnpm check`, the CI matrix, CodeQL and the browser smoke all pass. The docs describe the delivered behavior, including the roadmap Phase 2 status and an ADR for the storage choice and data location.

## Left to the builder

- Exact module split inside `packages/storage`.
- SQL statement style.
- UI placement and visual design of the session list (keep it consistent with the existing Studio).
- Debounce tuning.
- How the CLI formats the `--sessions` table.

## Delivery

This ships as two PRs:

1. **Store and application:** ports, use cases, in-memory and SQLite adapters, migrations, recovery, the revision adapter, CLI `--sessions`, and API endpoints with tests.
2. **Studio:** autosave, the session list and resume, the changed-architecture notice, retiring `localStorage`, `--resume`, the `--no-store` state, and the browser smoke extension.

Each PR updates the docs it affects.
