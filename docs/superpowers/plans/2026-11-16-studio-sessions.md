# Studio Sessions (Phase 2, sessions PR 2 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Studio use the local session store. It should autosave, list sessions, resume them, rename and delete them, start a new session, and show a changed-architecture notice. It also adds `archwise --serve --resume <id|latest>` and retires browser `localStorage` for Sandbox state.

**Architecture:**
- The session lifecycle stays in `SessionService`, which gains one method: `startNew`.
- The web app talks to the session API through a small typed client and a framework-free autosave controller. Both are unit-tested.
- `ArchitectureCanvas` stops touching `localStorage`. It receives an initial Sandbox document and reports serialized changes upward.
- `App.svelte` owns the session state. It also owns the saved-state indicator, the Sessions panel, and the notice that shows when the graph being displayed is a resumed session's base revision.

**Tech Stack:** Svelte 5, TypeScript, Vitest (jsdom, fake timers), Playwright smoke (`scripts/browser-smoke.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-16-sessions-and-local-store-design.md`. PR 1 (#11) delivered the store and API; see `docs/sessions.md`.

## Global Constraints

- All server calls go to the same origin with `credentials: 'same-origin'`. Mutating calls send `Content-Type: application/json`; the browser adds `Origin` automatically.
- The Sandbox document format stays `archwise-sandbox` v1, and its `projectSignature` must match the graph being displayed.
- **Autosave:** saves are debounced by 750 ms after the last change. The indicator has four states: `saved`, `saving`, `unsaved` and `disabled`. A failed save never discards in-memory state. The indicator offers a Retry, and the next change retries too.
- **Single active tab.** If a save returns 404 because the session was replaced or deleted in another tab, the indicator shows `unsaved` with "This session changed elsewhere. Reload to continue." The tab never writes into a different session on its own.
- **Resume ruling** (deferred minor from PR #11): resuming discards the reserved, never-persisted current ID. Nothing was stored under it, so nothing is lost.
- **`--no-store`:** the indicator reads "Not saving (store disabled)", the Sessions button is hidden, and JSON export and import keep working.
- **`localStorage` is no longer read or written** for Sandbox state.
- Use `npx --yes pnpm@10.34.9`. Commits are signed off and end with the Co-Authored-By attribution line. Docs must match the delivered behavior.

## Review Focus

1. **Reload during a pending debounce:** an edit made less than 750 ms before a page reload must not be lost silently. Flush the pending save on `pagehide`/`visibilitychange` with `fetch(..., { keepalive: true })` (owner: Task 2).
2. **Resuming a session whose base differs from current discovery:** the canvas must render the session's stored view, not today's graph. Otherwise `parseSandboxDocument` rejects it on signature mismatch (owner: Task 3, smoke in Task 4).
3. **Deleting the session currently open:** the Studio must switch to the fresh reserved session with an empty Sandbox. It must not keep autosaving into the deleted ID (owner: Tasks 1 and 3).
4. **Hostile labels in the session list** (for example `<img src=x onerror=…>`) render as text (owner: Task 3, Svelte escaping, and an assertion in the smoke).
5. **A `--resume` ID that doesn't exist, or `latest` with no sessions:** exit with code 2 and an actionable message, without starting a server (owner: Task 1).

---

### Task 1: `startNew`, a `POST /api/v1/sessions/new` route, and `--resume`

**Files:**
- Modify:
  - `packages/application/src/session-service.ts` (add `startNew(): { id: string; persisted: false }`, which reserves a fresh ID as current)
  - `apps/cli/src/session-routes.ts` (`POST /api/v1/sessions/new` returns the new current ID; same-origin required)
  - `apps/cli/src/index.ts` (parse `--resume <value>`: it requires `--serve` and conflicts with `--no-store`; the value is `latest` or matches `^ses-[0-9a-f]{24}$`; anything else exits 2)
  - `apps/cli/src/store-runtime.ts` (add `resumeTarget(service, value): string | null`)
  - `apps/cli/src/bin.ts` (resolve the target before starting the server; a miss exits 2 with "No saved session matches … Run --sessions to list them.")
- Test:
  - `packages/application/tests/session-service.test.ts`
  - `apps/cli/tests/session-api.test.ts`
  - `apps/cli/tests/cli.test.ts`
  - `apps/cli/tests/store-runtime.test.ts`
  - `scripts/tests/session-store-integration.test.mjs`

**Interfaces — Produces:**
- `SessionService.startNew()`
- `POST /api/v1/sessions/new` → `{ id, persisted: false, storeEnabled: true }`
- The `CliCommand` inspect variant gains `resume: string | null`
- `resumeTarget(service: SessionService, value: string): string | null`

- [ ] **Step 1:** Write the failing tests.
  - `startNew` after a save gives a new unpersisted current ID, and the old session stays listed.
  - `POST /new` without `Origin` returns 403; with it, it returns a new ID that differs from the previous one.
  - `parseCli(['--serve','--resume','latest'])` gives `resume: 'latest'`.
  - `--resume` without `--serve`, `--resume ses-bad`, and `--resume latest --no-store` each exit 2.
  - `resumeTarget`: `latest` returns the newest ID; an unknown ID returns null; `latest` with no sessions returns null.
  - Integration: `--serve --resume latest` on an empty store exits 2 with "Run --sessions". After a save, `--serve --resume latest` serves `current.id` equal to the saved ID.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/application test && npx --yes pnpm@10.34.9 --filter @archwise/cli test && node --test scripts/tests/session-store-integration.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: start new sessions and resume from the CLI`.

### Task 2: Web session client and autosave controller

**Files:**
- Create:
  - `apps/web/src/session-client.ts`
  - `apps/web/src/autosave.ts`
- Test:
  - `apps/web/src/session-client.test.ts`
  - `apps/web/src/autosave.test.ts`

**Interfaces — Produces:**

```ts
// session-client.ts — all functions take an injectable fetch (default globalThis.fetch)
export interface CurrentSession { readonly id: string | null; readonly persisted: boolean; readonly storeEnabled: boolean }
export interface SessionSummary { id: string; label: string; createdAt: string; updatedAt: string; componentCount: number; hasSnapshots: boolean; baseIsCurrent: boolean }
export interface SessionDetail extends SessionSummary { sandbox: string; view: unknown }
export type ClientResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
export function getCurrent(f?: typeof fetch): Promise<ClientResult<CurrentSession>>;
export function listSessions(f?): Promise<ClientResult<SessionSummary[]>>;
export function getSession(id: string, f?): Promise<ClientResult<SessionDetail>>;
export function resumeSession(id: string, f?): Promise<ClientResult<SessionDetail>>;
export function startNewSession(f?): Promise<ClientResult<CurrentSession>>;
export function saveSandbox(id: string, text: string, f?, init?: { keepalive?: boolean }): Promise<ClientResult<SessionSummary>>;
export function renameSession(id: string, label: string, f?): Promise<ClientResult<SessionSummary>>;
export function deleteSession(id: string, f?): Promise<ClientResult<null>>;

// autosave.ts — framework-free
export type SaveState = 'saved' | 'saving' | 'unsaved' | 'disabled';
export interface AutosaveStatus { readonly state: SaveState; readonly message: string }
export interface Autosave { schedule(text: string): void; flush(options?: { keepalive?: boolean }): Promise<void>; retry(): void; dispose(): void }
export function createAutosave(options: { save: (text: string, keepalive: boolean) => Promise<ClientResult<unknown>>;
  delayMs?: number /* default 750 */; onStatus: (status: AutosaveStatus) => void }): Autosave;
```

Autosave behavior:
- `schedule` stores the latest text and restarts the timer.
- When the timer fires, the controller saves (`saving`). On success it reports `saved` "All changes saved". On a 404 it reports `unsaved` "This session changed elsewhere. Reload to continue.", and after that it ignores every `schedule` call except an explicit `retry`. On any other failure it reports `unsaved` "Not saved — retrying on next change"; the next `schedule` or `retry` saves again.
- If text changes while a save is in flight, the controller saves again after the in-flight save completes, so the last write is always the latest text.
- Saving identical text twice in a row is a no-op that reports `saved`.

- [ ] **Step 1:** Write the failing tests.
  - **Client:** each function calls the right method, path and headers (`Content-Type` only on PUT/PATCH/POST with a body), and parses JSON. A non-2xx response gives `{ok:false, status, error}`. The client never throws on network errors; those give `status: 0`.
  - **Autosave** (Vitest fake timers): three schedules within 750 ms produce one save of the last text; success gives `saved`; a 500 gives `unsaved`, and a later schedule saves; a 404 gives the "changed elsewhere" message, and a later schedule does not save; changes during an in-flight save produce a follow-up save with the latest text; `flush({keepalive:true})` saves immediately with `keepalive` true; `dispose` cancels the timer.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/web test`. Expected: FAIL.
- [ ] **Step 3:** Implement both modules.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(web): session API client and autosave controller`.

### Task 3: Studio wiring, Sessions panel, and changed-architecture notice

**Files:**
- Create: `apps/web/src/SessionsPanel.svelte`, an accessible dialog (`role="dialog"`, `aria-label="Sessions"`) that:
  - lists sessions, newest first, each showing its label, a relative or absolute updated time, `N components`, an `A/B` badge, a `Architecture changed` badge when `!baseIsCurrent`, and a `Current` marker;
  - has actions Resume, Rename (an inline input with Save/Cancel) and Delete, which asks for confirmation inside the panel, not through `confirm()`;
  - has a "New session" button;
  - shows errors inline.
- Modify:
  - `apps/web/src/ArchitectureCanvas.svelte`
    - Remove the `localStorage` read/write (the `onMount` restore and the `$effect` write).
    - Add the props `initialDocument: string | null` (when present, restore it once on mount through `parseSandboxDocument`, with errors shown in `persistenceStatus`) and `onDocumentChange: (text: string) => void` (called from the existing `$effect` with `serializeSandboxDocument(createDocument())`).
    - Keep JSON export, import and reset.
  - `apps/web/src/App.svelte`
    - On mount, load `getCurrent`. With the store enabled and the session persisted, load `getSession`, use `detail.view` as the graph when `!detail.baseIsCurrent` (validated with `isGraph`; otherwise use `/api/v1/graph`), and pass `detail.sandbox` as `initialDocument`. Otherwise fetch `/api/v1/graph` as today, with `initialDocument = null`.
    - Create the autosave with `saveSandbox(currentId, text, fetch, {keepalive})`, and flush on `pagehide` and on `visibilitychange` to hidden.
    - Header: a save indicator (`role="status"`, `aria-live="polite"`) with a Retry button when `unsaved`, and a "Sessions" button when the store is enabled.
    - Resume, delete-current and new-session all reload the workspace state from the server (current, then graph and initial document). Remount the canvas with a `{#key}` block so state does not leak between sessions.
    - When the graph shown is a resumed session's base view, show a notice: "Architecture changed since this session started. You are viewing the graph as it was then." It has a "Start a new session on the current graph" button that calls `startNewSession` and reloads.
- Test: `apps/web/src/session-view.test.ts`, which tests a pure helper `chooseWorkspaceGraph(detail, currentGraph)` extracted to `apps/web/src/session-view.ts`. UI behavior is verified in Task 4.

**Interfaces — Produces:**

```ts
// session-view.ts
export function chooseWorkspaceGraph(detail: { baseIsCurrent: boolean; view: unknown } | null, current: Graph): { graph: Graph; historical: boolean };
```

`chooseWorkspaceGraph` returns `{current, false}` when there is no detail, when `baseIsCurrent` is true, or when `view` fails `isGraph`. Otherwise it returns `{view, true}`.

- [ ] **Step 1:** Write the failing tests for `chooseWorkspaceGraph`: null detail, a current base, a historical base with a valid view, and a historical base with an invalid view.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/web test`. Expected: FAIL.
- [ ] **Step 3:** Implement `session-view.ts`, the panel, and the canvas and App changes.
- [ ] **Step 4:** Run `npx --yes pnpm@10.34.9 --filter @archwise/web test && npx --yes pnpm@10.34.9 --filter @archwise/web build`. Expected: PASS, and `svelte-check` reports 0 errors and 0 warnings.
- [ ] **Step 5:** Commit with `feat(web): autosaved sessions, session list and resume in the Studio`.

### Task 4: Browser smoke for sessions

**Files:**
- Modify: `scripts/browser-smoke.mjs`

Changes:
- Analyze a temporary synthetic fixture project, written by the script (two packages with one dependency), instead of `--path .`. Use a temporary `ARCHWISE_DATA_DIR`. Delete both in `finally`.
- Replace the `localStorage` reads with `savedDocument()`, which runs in the page, fetches `/api/v1/sessions/current`, then `/api/v1/sessions/{id}`, and parses `sandbox`. Wait for the indicator to read "All changes saved" before reading.
- After the existing flow (reload restores from the store), add a **cross-launch resume**:
  1. Stop the server.
  2. Add a third package manifest to the fixture.
  3. Start a new server with the same data directory and open a new page. The canvas has 0 proposed nodes.
  4. Open Sessions. The previous session shows `A/B` and `Architecture changed`.
  5. Click Resume. Expect 3 proposed nodes, 2 edges, the changed-architecture notice visible, and `savedA` and `savedB` in the document.
  6. Rename the session to `<img src=x onerror=alert(1)>`. The list shows that literal text and no `img` element is created inside the panel (Review Focus 4).
  7. Delete it after confirmation. The canvas is empty and the indicator is not `unsaved` (Review Focus 3).
- Keep failing on any page error.

- [ ] **Step 1:** Install the driver locally into the scratchpad: `npm install --prefix <scratchpad>/pw --no-save --no-package-lock --ignore-scripts playwright@1.56.1`.
- [ ] **Step 2:** Modify the smoke, then run `npx --yes pnpm@10.34.9 build && ARCHWISE_BROWSER_CHANNEL=chrome ARCHWISE_PLAYWRIGHT_ENTRY=<scratchpad>/pw/node_modules/playwright/index.mjs node scripts/browser-smoke.mjs`. Expected: the script prints the passed message. If local Chrome is unavailable, rely on the CI `Browser Studio Smoke` job and record that in the ledger.
- [ ] **Step 3:** Commit with `test(browser): exercise autosave, cross-launch resume, rename and delete`.

### Task 5: Documentation, full check, PR

**Files:**
- `docs/sessions.md`: remove the "Studio does not use them yet" status, describe the Studio flows (indicator, Sessions panel, resume, notice, new session, `--resume`, single-tab rule, `--no-store`), and add `POST /api/v1/sessions/new` to the API table.
- `docs/sandbox-persistence.md`: Sandbox state now lives in the local store and autosaves; reload restores from the store; `localStorage` is retired (older browser-only Sandboxes move through JSON export/import from a previous build); export/import are unchanged.
- `docs/scenario-comparison.md`, `docs/alpha-testing.md` (steps 10–11 and the limits), `docs/browser-qa.md` (the new scenarios), and `docs/canvas-first-ux.md` (if it mentions browser storage).
- `README.md` status line, `docs/implementation-roadmap.md` (Phase 2 current-state table and status: the sessions slice is complete; remaining items are export redaction of home paths and the exit-gate evidence), `apps/web/README.md`, `apps/cli/README.md` (`--resume`), and `.changeset/studio-sessions.md`.

- [ ] **Step 1:** Update the docs, and grep for `localStorage` across `docs/` and `README.md` to confirm that each remaining mention is accurate.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 check` and the relative-link check. Expected: both pass.
- [ ] **Step 3:** Commit with `docs: Studio sessions, autosave and resume`. Then run the final review, push, open the PR, wait for the required checks and the browser smoke, and merge.
