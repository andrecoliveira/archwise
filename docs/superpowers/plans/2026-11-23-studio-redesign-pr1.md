# Studio Redesign PR 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Studio its new visual foundation:
- design tokens, with dark (the default) and light themes;
- the bundled JetBrains Mono font;
- a three-column layout with a top bar;
- Explore and Sandbox tabs, opening in Explore when components exist;
- the revision chip and the Scan notes;
- flat component cards;
- every existing screen restyled onto the tokens.

**Architecture:**
- **Pure logic in tested modules.** Theme storage, mode choice, scan status, gap wording and keyboard shortcuts each get a small module in `apps/web/src`, unit-tested in Vitest.
- **Thin Svelte components.** They only bind that logic to markup: `StudioTopBar`, `RevisionChip`, `ScanNotes`.
- **Tokens drive all styling.** Every color is a custom property in `styles/tokens.css`, and a test forbids literal colors anywhere else.
- **The CLI's local server** adds `font-src 'self'` to its CSP and a `scannedAt` timestamp to `/api/v1/scan`.

**Tech Stack:** Svelte 5, `@xyflow/svelte` 1.7.1, Vite 8, Vitest, `@testing-library/svelte`, Node HTTP server (`apps/cli/src/local-server.ts`), Playwright smoke (`scripts/browser-smoke.mjs`), and `@fontsource/jetbrains-mono` 5.3.0 (new).

**Spec:** `docs/superpowers/specs/2026-11-23-studio-redesign-design.md` (approved 2026-11-23). Glossary: `CONTEXT.md`.

## Global Constraints

- **No network requests the user did not trigger.** The font ships in the bundle, and no CDN or remote asset is used (spec §3, §7).
- **One new runtime dependency:** `@fontsource/jetbrains-mono`, pinned exactly at `5.3.0` (published 2026-07-19), in `apps/web` only. The justification goes in the PR body (spec §7).
- **Theme.** Dark is the default, light the alternative. The choice persists in `localStorage` under the key `archwise.theme`. Every storage access is wrapped in try/catch, and the page works without storage (spec §4.1).
- **Colors.** Every color is a CSS custom property defined in `apps/web/src/styles/tokens.css`. No other stylesheet or Svelte `<style>` may contain a hex, `rgb(`, `rgba(`, `hsl(` or named-color literal (spec §4.1).
- **Token starting values:** take them from the mockup `docs/superpowers/specs/assets/2026-11-23-studio-redesign-mockup.html`. The **queue fill changes from amber to terracotta:** dark `#d9774a`, light `#efb08e`. `--accent` (amber) means selection and focus only (spec §5.10).
- **Font.** JetBrains Mono, weights 400, 500 and 700, Latin subset. The fallback stack is `ui-monospace, SFMono-Regular, Menlo, monospace`.
- **Words** follow `CONTEXT.md`: Explore, Sandbox, System view, All packages, Observed, Inferred, "not analyzed". Never "Confirmed" or "Deduced".
- **Mode names.** The tabs are labelled **Explore** and **Sandbox**, in a group with the accessible name "Studio mode".
- **Layout.** Three columns (left list, center canvas, right inspector) plus the top bar. Left and right collapse. Below 1100 px of viewport width, left and right become drawers (spec §4.2).
- **No timeline** under the canvas (spec §5.12).
- **Accessibility.** Every interactive element is keyboard-reachable and has an accessible name. Confidence is never carried by color alone. Contrast is WCAG AA in both themes.
- **Commits.** Conventional commits, signed off with `git commit -s`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Docs.** Use `npx --yes pnpm@10.34.9`. Never run Prettier on `docs/`.

### Spec refinement carried by this plan

- **`scannedAt` location.** Spec §12.1 point 4 puts `scannedAt` on `/api/v1/graph`. This plan puts it on **`/api/v1/scan`** instead (`ScanSummary.scannedAt`, ISO 8601). It describes the scan, and adding it to the view graph would change the graph that sessions store and the `--graph` golden. Task 3 updates spec §12.1 to match.

## Review Focus

1. **Storage throws or is missing** (private window, blocked site data). Expected: the theme falls back to dark and nothing breaks. Pinned in Task 1, `readTheme returns dark when storage throws`.
2. **An older server.** Its `/api/v1/scan` has no `scannedAt`, or returns 404. Expected: the chip shows "scan time unknown" or hides the time, and never shows "Invalid Date". Pinned in Task 3, `revisionChip without scannedAt`.
3. **Very long names** (a package name of about 80 characters, deep paths) in the list, top bar and Scan notes. Expected: ellipsis with the full text in `title`, and no horizontal page scroll. Pinned in Task 8 by the smoke check at 1024 × 768.
4. **Resuming a historical session.** Expected: the chip shows the current scan time, and "viewing an earlier architecture" makes clear that the canvas is not the latest scan. Pinned in Task 3, `revisionChip marks historical views`.
5. **A project with no components** (no manifests). Expected: the Studio opens in Sandbox, and the empty state offers "Open Sandbox" from Explore. Pinned in Task 5, `initialMode`, plus the smoke check.

---

### Task 1: Tokens, themes and the bundled font

**Files:**
- Create:
  - `apps/web/src/styles/tokens.css`
  - `apps/web/src/styles/fonts.css`
  - `apps/web/src/theme.ts`
  - `apps/web/src/theme.test.ts`
- Modify:
  - `apps/web/package.json`: add `"@fontsource/jetbrains-mono": "5.3.0"` to `dependencies`;
  - `pnpm-lock.yaml`;
  - `apps/web/src/main.ts`: import `./styles/fonts.css` and `./styles/tokens.css` before `App`, and call `applyTheme(document.documentElement, readTheme(safeStorage()))` before mount;
  - `apps/cli/src/local-server.ts:54-57`: add `font-src 'self'` to the CSP;
  - `apps/cli/tests/local-server.test.ts`.

**Interfaces:**
- Produces:
  - `export type Theme = 'dark' | 'light'`
  - `export const THEME_KEY = 'archwise.theme'`
  - `export function safeStorage(): Storage | null`: returns `window.localStorage`, or null if accessing it throws.
  - `export function readTheme(storage: Pick<Storage,'getItem'> | null): Theme`
  - `export function writeTheme(storage: Pick<Storage,'setItem'> | null, theme: Theme): void`: swallows errors.
  - `export function applyTheme(root: HTMLElement, theme: Theme): void`: sets `root.dataset.theme`.
  - `export function nextTheme(theme: Theme): Theme`
  - CSS: `:root[data-theme="dark"]` and `:root[data-theme="light"]` define:
    - surfaces: `--bg --panel --panel-2 --line`;
    - ink: `--ink --ink-2 --ink-3`;
    - outlines: `--outline --stroke --shadow`;
    - accent: `--accent --accent-ink`;
    - kind fills: `--kind-frontend --kind-service --kind-module --kind-datastore --kind-queue --kind-external --kind-job`;
    - `--plinth --msg`;
    - states: `--ok --warn --danger`;
    - `--font-mono`.

- [ ] **Step 1: Write the failing tests** in `apps/web/src/theme.test.ts`:

```ts
test('readTheme defaults to dark', () => expect(readTheme({ getItem: () => null })).toBe('dark'));
test('readTheme returns a stored light theme', () =>
  expect(readTheme({ getItem: (k) => (k === THEME_KEY ? 'light' : null) })).toBe('light'));
test('readTheme ignores unknown stored values', () => expect(readTheme({ getItem: () => 'neon' })).toBe('dark'));
test('readTheme returns dark when storage throws', () =>
  expect(readTheme({ getItem: () => { throw new Error('denied'); } })).toBe('dark'));
test('readTheme returns dark without storage', () => expect(readTheme(null)).toBe('dark'));
test('writeTheme swallows storage errors', () =>
  expect(() => writeTheme({ setItem: () => { throw new Error('quota'); } }, 'light')).not.toThrow());
test('applyTheme sets data-theme', () => {
  const root = document.createElement('html'); applyTheme(root, 'light'); expect(root.dataset.theme).toBe('light');
});
test('nextTheme toggles', () => { expect(nextTheme('dark')).toBe('light'); expect(nextTheme('light')).toBe('dark'); });
```

Also add to `apps/cli/tests/local-server.test.ts`:

```ts
test('the CSP allows only self-hosted fonts', async () => {
  // start the server as the existing tests do, GET / (or /api/v1/health), read the header
  expect(csp).toContain("font-src 'self'");
  expect(csp).toContain("default-src 'none'");
});
```

- [ ] **Step 2: Run them and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/theme.test.ts < /dev/null` and `npx --yes pnpm@10.34.9 --filter @archwise/cli exec vitest run tests/local-server.test.ts < /dev/null`
  Expected: FAIL. The theme module does not exist, and the CSP lacks `font-src`.

- [ ] **Step 3: Implement.**
  - `theme.ts`, per the Interfaces block.
  - `tokens.css`, with values from the mockup, except the queue terracotta and the state colors: dark `--ok #8fe07a`, `--warn #e8b04b`, `--danger #e58f8f`; light `--ok #3d8a2f`, `--warn #9a6a12`, `--danger #b4423f`.
  - `fonts.css` imports `@fontsource/jetbrains-mono/latin-400.css`, `latin-500.css` and `latin-700.css`, and sets `--font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`.
  - The CSP gains `font-src 'self'`.
  - Install with `npx --yes pnpm@10.34.9 --filter @archwise/web add @fontsource/jetbrains-mono@5.3.0 --save-exact`.

- [ ] **Step 4: Run the tests and watch them pass.** Same commands. Expected: PASS.

- [ ] **Step 5: Build, to prove the fonts are bundled locally.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web build && ls apps/web/dist/assets | grep -c woff2`
  Expected: the build succeeds and at least 3 `.woff2` files are listed. `grep -r "fonts.googleapis" apps/web/dist` prints nothing.

- [ ] **Step 6: Commit.**
  `feat(web): design tokens, dark/light themes and bundled JetBrains Mono`

### Task 2: Restyle every screen onto the tokens

**Files:**
- Create:
  - `apps/web/src/styles/no-literal-colors.test.ts`
  - `apps/web/src/styles/base.css`: element defaults on tokens (`body`, `button`, `input`, `select`, `code`, focus ring)
- Modify:
  - `apps/web/src/studio.css`: every color becomes `var(--…)`. Remove the timeline-free leftovers. Panels, buttons, the toolbar, the simulation drawer, the connection inspector, the floating inspector, the catalog, the sessions panel, alerts and notices all use `--panel`, `--panel-2`, `--line`, the ink tokens and `--accent` (focus and active only).
  - `<style>` blocks of `ArchitectureNode.svelte`, `ArchitectureEdge.svelte`, `SessionsPanel.svelte` and `SimulationPanel.svelte`.

**Interfaces:**
- Consumes: the Task 1 token names.
- Produces: `base.css`, imported in `main.ts` after `tokens.css`.

- [ ] **Step 1: Write the failing guard test** `no-literal-colors.test.ts`:
  - read every `.css` file under `apps/web/src` except `styles/tokens.css`, plus every `.svelte` file's `<style>` content and its `style="…"` attribute values;
  - assert that none matches `/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:white|black|red|green|blue|gray|grey|orange|yellow|purple)\b(?![-\w])/`;
  - name each offending file and line in the failure message.

  `color-mix()` with token arguments is allowed. The literals `transparent` and `currentColor` are allowed.

- [ ] **Step 2: Run it and watch it fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/styles/no-literal-colors.test.ts < /dev/null`
  Expected: FAIL, listing the current literals (studio.css starts with `#0b1220`).

- [ ] **Step 3: Restyle.** Replace every literal with the token that carries its meaning:
  - surfaces: `--bg`, `--panel`, `--panel-2`;
  - borders: `--line`;
  - text: `--ink`, `--ink-2`, `--ink-3`;
  - success, warnings, errors: `--ok`, `--warn`, `--danger`;
  - selection and focus: `--accent`.

  Set the body font to `var(--font-mono)`, with base size 13px and line-height 1.5. Buttons use the mockup's style: 8px radius, a 1px `--line` border, and an active or pressed state with an `--accent` fill, `--accent-ink` text and a `2px 2px 0 var(--shadow)` offset shadow.

- [ ] **Step 4: Run the guard and the whole web suite.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web test < /dev/null`
  Expected: all PASS.

- [ ] **Step 5: Commit.**
  `style(web): every Studio screen uses design tokens`

### Task 3: Scan time and the revision chip

**Files:**
- Modify:
  - `apps/cli/src/inventory-output.ts:163-200`: `ScanSummary` gains `readonly scannedAt: string`, and `scanSummary(result, scannedAt)` takes it.
  - `apps/cli/src/bin.ts:182`: pass `startedAt`.
  - `apps/cli/tests/inventory-output.test.ts:268`.
  - `apps/web/src/scan-summary.ts`: `ScanSummaryView.scannedAt?: string`, which `isScanSummary` accepts when absent or when it is a string that `Date.parse` understands.
  - `docs/superpowers/specs/2026-11-23-studio-redesign-design.md` §12.1 point 4: change "a new `scannedAt` field on `/api/v1/graph`" to "a new `scannedAt` field on `/api/v1/scan`".
- Create:
  - `apps/web/src/scan-status.ts`
  - `apps/web/src/scan-status.test.ts`
  - `apps/web/src/RevisionChip.svelte`

**Interfaces:**
- Produces:
  - `export interface ChipInput { scan: ScanSummaryView | null; graph: Graph; storeEnabled: boolean; historical: boolean; now: number }`
  - `export interface Chip { text: string; status: 'complete' | 'partial'; reasons: string[] }`
  - `export function revisionChip(input: ChipInput): Chip`
  - `export function relativeTime(iso: string, now: number): string | null`. Returns, by age:
    - under 1 min: "just now";
    - under 60 min: "N min ago";
    - under 24 h: "N h ago";
    - otherwise: the local date `YYYY-MM-DD`;
    - null for an unparseable value.
  - `RevisionChip.svelte`, with props `{ chip: Chip; scan: ScanSummaryView | null }`. It renders `chip.text`, a status badge, and a `<details>` titled "Scan details". The details list `repositoryLines`, `skippedLine` and the reasons.

  A scan is **partial** when any of these holds. Each holds one reason, in this order:
  - `scan.truncated !== null`: "the <budget> budget ran out";
  - any repository has `reached === false`: "<label> was not scanned";
  - any diagnostic starts with `Analyzer failed`: "an analyzer failed";
  - any gap has `reason === 'budget'`: "an analyzer ran out of budget".

- [ ] **Step 1: Write the failing tests** in `scan-status.test.ts`, building graphs with `graph-fixtures.ts` helpers:

```ts
test('complete scan', () => expect(revisionChip({ scan: scanAt('2026-11-23T10:00:00Z'), graph: emptyGraph(), storeEnabled: true, historical: false, now: Date.parse('2026-11-23T10:02:00Z') }))
  .toEqual({ text: 'scanned 2 min ago · complete', status: 'complete', reasons: [] }));
test('truncated scan is partial with its reason', () => /* scan.truncated = 'time' */
  expect(chip.status).toBe('partial') && expect(chip.reasons).toEqual(['the time budget ran out']));
test('unreached repository is partial', …reasons ['lib was not scanned']);
test('failed analyzer is partial', …diagnostics ['Analyzer failed: docker-compose in x. Its findings were discarded.'] → reasons ['an analyzer failed']);
test('store off adds not saved', … text 'scanned just now · complete · not saved');
test('revisionChip without scannedAt', … scan without scannedAt → text 'scan time unknown · complete');
test('revisionChip without a scan summary', … scan null → text 'complete');
test('revisionChip marks historical views', … historical true → text ends with ' · viewing an earlier architecture');
test('relativeTime', () => { expect(relativeTime('2026-11-23T10:00:00Z', Date.parse('2026-11-23T10:00:30Z'))).toBe('just now');
  expect(relativeTime('2026-11-23T08:00:00Z', Date.parse('2026-11-23T10:00:00Z'))).toBe('2 h ago');
  expect(relativeTime('nonsense', 0)).toBeNull(); });
test('isScanSummary rejects an unparseable scannedAt', () => expect(isScanSummary({ ...valid, scannedAt: 'x' })).toBe(false));
```

In `inventory-output.test.ts`, assert `scanSummary(multi, '2026-11-23T00:00:00.000Z').scannedAt === '2026-11-23T00:00:00.000Z'`.

- [ ] **Step 2: Run them and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/scan-status.test.ts < /dev/null` and `npx --yes pnpm@10.34.9 --filter @archwise/cli exec vitest run tests/inventory-output.test.ts < /dev/null`
  Expected: FAIL. The module is missing and the signature mismatches.

- [ ] **Step 3: Implement** per the Interfaces block. The text is `[time part, status, optional "not saved", optional "viewing an earlier architecture"]` joined with " · ". The time part is "scanned <relativeTime>". It becomes "scan time unknown" when `scannedAt` is missing or unparseable, and is omitted when `scan` is null.

- [ ] **Step 4: Run the tests and watch them pass.** Same commands. Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat: scan time on /api/v1/scan and the Studio revision chip`

### Task 4: Scan notes

**Files:**
- Create:
  - `apps/web/src/scan-notes.ts`
  - `apps/web/src/scan-notes.test.ts`
  - `apps/web/src/ScanNotes.svelte`
- Modify: `apps/web/src/scan-summary.ts`. Remove `gapLines` once nothing imports it, and update its tests.

**Interfaces:**
- Produces:
  - `export const GAP_REASON_TEXT: Readonly<Record<GapReason, string>>`:

    | Reason | Text |
    |---|---|
    | `unsupported` | not supported yet |
    | `invalid-syntax` | invalid syntax |
    | `too-large` | too large to analyze |
    | `binary` | binary file |
    | `unreadable` | could not be read |
    | `budget` | the analyzer ran out of budget |
    | `unmatched-build-context` | its Compose build context matches no package |
    | `unidentified-datastore` | its datastore technology was not identified |

  - `export interface ScanNotesView { gaps: { path: string; reason: string }[]; notes: string[]; headline: string }`
  - `export function scanNotes(graph: Graph): ScanNotesView`. Gaps are sorted by path, then reason. `notes` holds `graph.diagnostics` in their given order. `headline` is "1 file not analyzed · 2 notes", with plural forms, dropping a zero part, and "Nothing to report" when both are empty.
  - `ScanNotes.svelte`, with props `{ view: ScanNotesView }`: a section named "Scan notes", listing gaps (path in `<code>` with a `title`, then the reason text) and then notes.

- [ ] **Step 1: Write the failing tests:**

```ts
test('headline counts files and notes', () => expect(scanNotes(graphWith({ gaps: [gap('compose.prod.yaml','unsupported')], diagnostics: ['a','b'] })).headline).toBe('1 file not analyzed · 2 notes'));
test('headline drops zero parts', … only diagnostics ['a'] → '1 note');
test('nothing to report', … → 'Nothing to report');
test('every gap reason has text', () => for (const r of GAP_REASONS) expect(GAP_REASON_TEXT[r]).toMatch(/\S/));
test('gaps read as file and reason', … → gaps [{ path: 'compose.prod.yaml', reason: 'not supported yet' }]);
test('gaps sort by path then reason', …);
test('no diagnostic is dropped', … 5 diagnostics in → the same 5 out, same order);
```

- [ ] **Step 2: Run them and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/scan-notes.test.ts < /dev/null`
  Expected: FAIL, because the module is missing.

- [ ] **Step 3: Implement** per the Interfaces block.

- [ ] **Step 4: Run the tests and watch them pass.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): Scan notes list coverage gaps and diagnostics in words`

### Task 5: Explore/Sandbox tabs and the opening mode

**Files:**
- Create:
  - `apps/web/src/studio-mode.ts`
  - `apps/web/src/studio-mode.test.ts`
- Modify:
  - `apps/web/src/ArchitectureCanvas.svelte:469-476`: remove the in-canvas `studio-mode-switch`. `mode` stays a bindable prop owned by App, and the toolbar keeps Auto layout and the Sandbox actions.
  - `apps/web/src/App.svelte`: `studioMode` starts from `initialMode(chosen.graph)` on every successful `loadGraph`.
  - `scripts/browser-smoke.mjs:76,224,225,300`: use `Explore` and `Sandbox` as the button names. Click **Sandbox** before the sandbox steps, because the fixture has components and the Studio opens in Explore.

**Interfaces:**
- Produces:
  - `export type StudioMode = 'explore' | 'sandbox'`
  - `export function initialMode(graph: Graph): StudioMode`: `'explore'` when `graph.nodes.length > 0`, else `'sandbox'`.
  - `export function isSearchShortcut(e: Pick<KeyboardEvent,'key'|'metaKey'|'ctrlKey'|'target'>): boolean`. True for `/`, and for `k` with meta or ctrl. False when the target is an `input`, a `textarea`, a `select` or contenteditable.

- [ ] **Step 1: Write the failing tests:**

```ts
test('initialMode opens Explore when components exist', () => expect(initialMode(graphWithNodes(1))).toBe('explore'));
test('initialMode opens Sandbox for an empty project', () => expect(initialMode(emptyGraph())).toBe('sandbox'));
test('slash focuses search', () => expect(isSearchShortcut({ key: '/', metaKey: false, ctrlKey: false, target: document.body })).toBe(true));
test('cmd-k and ctrl-k focus search', …);
test('typing a slash inside an input does not', () => expect(isSearchShortcut({ key: '/', metaKey: false, ctrlKey: false, target: document.createElement('input') })).toBe(false));
```

- [ ] **Step 2: Run them and watch them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/studio-mode.test.ts < /dev/null`
  Expected: FAIL.

- [ ] **Step 3: Implement** the module and the App and canvas changes above. Tabs come in Task 6's top bar. Until then, App renders the two buttons in place of the old switch so the app stays usable.

- [ ] **Step 4: Run the web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `feat(web): Explore and Sandbox tabs; open in Explore when components exist`

### Task 6: Three-column layout and top bar

**Files:**
- Create: `apps/web/src/StudioTopBar.svelte`
- Modify:
  - `apps/web/src/App.svelte`: the layout shell and states;
  - `apps/web/src/studio.css`: the grid, drawers and collapse.

**Interfaces:**
- Consumes:
  - `Theme` with `readTheme`, `writeTheme`, `applyTheme`, `nextTheme` and `safeStorage` (Task 1);
  - `revisionChip` and `RevisionChip` (Task 3);
  - `scanNotes` and `ScanNotes` (Task 4);
  - `StudioMode`, `initialMode` and `isSearchShortcut` (Task 5).
- Produces:
  - `StudioTopBar.svelte` props: `{ workspace: string; chip: Chip; scan: ScanSummaryView | null; mode: StudioMode (bindable); search: string (bindable); theme: Theme; onToggleTheme: () => void; saveStatus: AutosaveStatus; onRetrySave: () => void; storeEnabled: boolean; sessionsOpen: boolean (bindable) }`.
  - It renders, left to right:
    - the logo and "Archwise" (the hexagon-cube SVG from the mockup);
    - the workspace name: the single repository label, or "N repositories";
    - `RevisionChip`;
    - the "Studio mode" group with Explore and Sandbox, using `aria-pressed`;
    - the search input "Find component…", with `aria-label` "Find component" and `aria-keyshortcuts="/ Control+K Meta+K"`;
    - the theme button, with accessible name "Switch to light theme" or "Switch to dark theme";
    - the save indicator (keeping the `.save-indicator` class and the Retry button);
    - Sessions.
  - Layout rules:
    - `main` is a grid with columns `260px 1fr 340px` and a 14px gap.
    - Each side column has a collapse button: "Hide components" / "Show components" and "Hide inspector" / "Show inspector", with `aria-expanded`.
    - Under `@media (max-width: 1099px)`, the side columns are off-canvas drawers that open over the canvas. They stay hidden until opened, and Esc closes them.
  - The left column holds:
    - in Explore: the component list (search lives in the top bar) and `ScanNotes`;
    - in Sandbox: the catalog, unchanged in behavior.
  - The right column holds the existing inspector content, restyled. Its structure changes in PR 3.
  - States, restyled inside the center column:
    - loading;
    - error, with Retry;
    - empty project: "No package manifests found." with an **Open Sandbox** button that sets mode to `sandbox`;
    - nothing recognized;
    - historical notice.

- [ ] **Step 1: Write the failing component test** `apps/web/src/StudioTopBar.test.ts`, with `@testing-library/svelte`:

```ts
test('mode tabs switch and expose pressed state', async () => { /* render; click 'Sandbox'; expect getByRole('button',{name:'Sandbox'}).getAttribute('aria-pressed') === 'true' */ });
test('theme button names the theme it switches to', … dark → 'Switch to light theme');
test('workspace shows the repository label or a count', … one repo → its label; three → '3 repositories');
test('search input is labelled', … getByRole('searchbox', { name: 'Find component' }));
```

- [ ] **Step 2: Run it and watch it fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/StudioTopBar.test.ts < /dev/null`
  Expected: FAIL.

- [ ] **Step 3: Implement** the top bar, the App shell, the drawers and the states. Wire a global `keydown` handler: `isSearchShortcut` focuses the search input; Esc closes an open drawer.

- [ ] **Step 4: Run the web suite and the typecheck.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web test < /dev/null && npx --yes pnpm@10.34.9 --filter @archwise/web typecheck`
  Expected: PASS, with 0 errors and 0 warnings.

- [ ] **Step 5: Commit.**
  `feat(web): three-column Studio with top bar, drawers and designed states`

### Task 7: Flat component cards

**Files:**
- Modify:
  - `apps/web/src/DiscoveredNode.svelte`;
  - `apps/web/src/ArchitectureNode.svelte` (Sandbox cards, styling only);
  - `apps/web/src/studio.css`.
- Create: `apps/web/src/DiscoveredNode.test.ts`

**Interfaces:**
- Produces:
  - `DiscoveredNode` renders a card `div.archwise-node.discovered-node[data-kind][data-confidence]`, filled with `var(--kind-<kind>)`. The two `external-system` kinds map to `--kind-external`.
  - Each card shows:
    - a label row with the uppercase kind name;
    - the component label;
    - a second line with the technology;
    - the word "inferred" when its confidence is inferred.
  - Outlines:
    - **Inferred:** dashed 1.8px `--outline`.
    - **Observed:** solid.
    - **Selected:** 3px `--accent`, the only use of accent on the card.

    No color difference encodes confidence.
  - It keeps the hidden handles as today.

- [ ] **Step 1: Write the failing test:**

```ts
test('inferred card is dashed and labelled, not recolored', () => { /* render inferred datastore; expect card.dataset.confidence === 'inferred'; expect(getByText('inferred')); expect(card.dataset.kind === 'datastore') */ });
test('observed card has no inferred label', …);
test('selected card is marked', … selected true → card has class 'chosen');
```

- [ ] **Step 2: Run it and watch it fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/DiscoveredNode.test.ts < /dev/null`
  Expected: FAIL, because there is no `data-confidence` attribute yet.

- [ ] **Step 3: Implement** the card markup and styles.

- [ ] **Step 4: Run the web suite.** Expected: PASS.

- [ ] **Step 5: Commit.**
  `style(web): flat component cards with kind fills and confidence outlines`

### Task 8: Browser smoke, screenshots and docs

**Files:**
- Modify:
  - `scripts/browser-smoke.mjs`;
  - `docs/architecture.md` (web UI section);
  - `docs/security.md` (CSP `font-src 'self'`; bundled font; no remote assets);
  - `docs/alpha-testing.md` (themes; the keyboard walkthrough: Tab through the top bar, `/` to search, Esc to close drawers);
  - `docs/sessions.md` (the scan summary's `scannedAt`);
  - `docs/implementation-roadmap.md`;
  - `README.md` (Studio description).
- Create:
  - `.changeset/studio-redesign-foundation.md` (patch, `@archwise/web` and `@archwise/cli`);
  - `docs/decisions/` stays unchanged in this PR. ADR 0008 comes in PR 3.
- Commit `CONTEXT.md` and the spec, its asset and this plan if they are not yet committed.

Roadmap changes:
- add a "Studio redesign (interlude before Phase 4 PR 2)" line to Current state, with 1 of 3 PRs done;
- add the work item "Revision timeline whose labels come from real revision diffs" to Phase 7.

- [ ] **Step 1: Add the smoke checks first** and watch them fail on the current build:
  1. **Theme and opening mode.** After load, `document.documentElement.dataset.theme === 'dark'`, and the Explore button has `aria-pressed="true"`.
  2. **Theme toggle.** Clicking "Switch to light theme" sets `light`. After a reload, it is still `light`.
  3. **Font.** `getComputedStyle(document.body).fontFamily` contains `JetBrains Mono`. `document.fonts.check('13px "JetBrains Mono"')` is true after `document.fonts.ready`.
  4. **No remote requests.** Every request the page makes has the same origin as the server.
  5. **Viewport 1024 × 768.**
     - `document.documentElement.scrollWidth <= window.innerWidth`, with a fixture package renamed to an 80-character name.
     - The inspector drawer is hidden until "Show inspector" is clicked.
  6. **Scan notes.** The Scan notes headline is visible. With a `compose.prod.yaml` added to the fixture, it reads `1 file not analyzed`.
  7. **Screenshots** saved to the smoke's output folder for review: dark and light, at 1600 × 950 and 1024 × 768.
  8. **No console errors** (the existing check, kept).

  Run: `npx --yes pnpm@10.34.9 build && ARCHWISE_BROWSER_CHANNEL=chrome node scripts/browser-smoke.mjs`
  Expected before Tasks 1–7: FAIL on check 1. After them: PASS.

- [ ] **Step 2: Accessibility check.**
  - **If `axe-core` is already resolvable** from the existing toolchain (`node -e "require.resolve('axe-core')"` succeeds from the repository root), inject it in the smoke and fail on any serious or critical violation.
  - **Otherwise,** do not add it. Record the manual keyboard walkthrough in `docs/alpha-testing.md`, and record a Ruling in the ledger.

- [ ] **Step 3: Docs.** Update the files listed above. Every statement describes delivered behavior only.

- [ ] **Step 4: Full verification.**
  Run: `npx --yes pnpm@10.34.9 check < /dev/null` and the smoke command above.
  Expected:
  - every check passes;
  - the screenshots are reviewed by eye: both themes legible, no clipped text, the canvas filling the center column.

- [ ] **Step 5: Commit.**
  `docs: Studio foundation redesign — themes, layout, Scan notes, roadmap`
