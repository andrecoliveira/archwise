# Safe Inventory (Phase 3, PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CLI's ad-hoc manifest walk with a safe, explainable, budgeted single-root inventory in a new `packages/discovery`, behind an application port, with scan records in the local store.

**Architecture:**
- `packages/application` gains the `WorkspaceInventory` port, the inventory result types, `ScanRepository` and scan recording in `SessionService.open`.
- `packages/discovery` implements the port with `node:fs`. It has an in-repo gitignore matcher, skip-reason accounting, budgets, nested-repository detection, manifest hashing and `AbortSignal` cancellation.
- `packages/storage` adds migration v2 (`scans`).
- `apps/cli` composes the pieces and gains the summary, the new `--json`, progress and Ctrl+C handling.
- Graph and revision builders stay in `apps/cli`. Single-root IDs are kept.

**Tech Stack:** TypeScript, Node 24/26, `node:fs/promises`, `node:crypto`, `node:sqlite`, Vitest, `node:test`, dependency-cruiser.

**Spec:** `docs/superpowers/specs/2026-11-19-safe-workspace-inventory-design.md` (PR 1 of its Delivery section).

## Global Constraints

- No new npm dependency. The gitignore matcher is in-repo.
- Nothing runs or writes inside an analyzed root. The only file contents read are `package.json` files.
- Absolute paths never reach `--json`, `--graph`, the API or the revision. Repository labels go through `redactSensitiveText`. A root equal to the home directory is labelled `home`.
- Single root: the workspace identity is the canonical root path (unchanged), the view node IDs are `package:<path relative to the root>` (unchanged) and the revision node IDs are `mod-<hash(path)>` (unchanged). The repository ID is `repo-root`.
- Nested repositories get `repo-` plus the first 16 hex characters of SHA-256 over their path relative to the user root, with `/` separators.
- Budget defaults (workspace totals): 200,000 listed entries, depth 32, 1 MiB per read file, 64 MiB total bytes read, 60 s wall clock.
- Built-in exclusions: `.git`, `.next`, `.turbo`, `node_modules`, `dist`, `build`, `coverage`, `.venv`, `vendor`, `.cache`, `.output`, `target`, `__pycache__`.
- Skip reasons, a closed set: `ignored-builtin`, `ignored-gitignore`, `symlink`, `outside-root`, `nested-repository`, `too-deep`, `too-large`, `binary`, `unreadable`, `special-file`, `budget-exhausted`, plus `unsupported-name` (see Ruling R2).
- At most 20 example paths per reason, the first 20 in code-unit order.
- Ordering is by code-unit order (`compareCodeUnits` from `@archwise/domain`), never `localeCompare`.
- A binary file has a NUL byte in its first 8 KiB.
- Ctrl+C exits with code 130. Root errors exit with code 2 and a stable message.
- Use `npx --yes pnpm@10.34.9`, never a bare `pnpm`.

## Rulings made while planning (carry into the ledger)

- **R1. The content hash is not stored in `archwise.graph` evidence.** The spec says "the hash goes into evidence", but `Evidence` in v1 has no hash field and strict import rejects unknown fields. Adding one is a format change that belongs to the Phase 4 analyzer SDK. The manifest SHA-256 goes into `InventoryResult.manifests[].sha256` and into `--json`. Cost if wrong: one additive field later.
- **R2. A new skip reason, `unsupported-name`.** It covers file names that cannot be a portable relative path:
  - a backslash in a POSIX name;
  - control characters;
  - ill-formed Unicode, which `checkRelativePath` rejects.

  Without it, such a name would make the revision invalid and switch sessions off. Cost if wrong: renaming one category.
- **R3. The `scanWorkspace` use case is the port call.** Recording the scan happens in `SessionService.open` through an optional `scan` input, because a scan row needs the revision ID that `open` decides. Cost if wrong: one function moves.

## Review Focus

1. **A large real monorepo hits a budget.** The scan must stop, report `budget-exhausted` with the budget name, and the revision coverage must be `partial`, never a silent cut. Owner: Task 3.
2. **Ctrl+C during `--serve` startup.** No server starts, the exit code is 130, and no half-written scan row is left. Owner: Task 6.
3. **A `.gitignore` that excludes a directory containing a `package.json`.** The manifest is not inventoried, the skip shows `ignored-gitignore`, and negation cannot re-include anything under `node_modules`. Owner: Task 2 and Task 3.
4. **A project whose packages live in a Git submodule (`.git` file).** It is still a single-root workspace with unchanged node IDs, but the nested repository is listed with its own ID. Owner: Task 3 and Task 4.
5. **A manifest that is a symlink pointing outside the root.** It is never read, and it is reported as `outside-root`. Owner: Task 3.

---

### Task 1: `packages/discovery` scaffold and the inventory port

**Files:**
- Create: `packages/discovery/{package.json,tsconfig.json,tsconfig.check.json,vitest.config.ts,README.md,src/index.ts}`, copying the `packages/storage` layout. Dependencies: `@archwise/application`, `@archwise/domain`.
- Create: `packages/application/src/inventory.ts`, exported from `packages/application/src/index.ts`.
- Move: `apps/cli/src/inventory.ts` to `packages/discovery/src/manifest-inventory.ts`, temporarily, with its tests moved to `packages/discovery/tests/`. `apps/cli` imports `inspectWorkspace` from `@archwise/discovery`, and `apps/cli/package.json` gains the dependency.
- Modify: `.dependency-cruiser.mjs` to add the rule `discovery-inward-only`: from `^packages/discovery/src/`, to `pathNot: '^packages/(discovery|application|domain|schemas)/'` with `dependencyTypesNot: ['core']`.
- Test: `scripts/tests/boundaries.test.mjs`, adding the case "rejects discovery imports of app code", modelled on the storage case at line 94.

**Interfaces (produces):**

```ts
// packages/application/src/inventory.ts
export const SKIP_REASONS = ['ignored-builtin','ignored-gitignore','symlink','outside-root',
  'nested-repository','too-deep','too-large','binary','unreadable','special-file',
  'budget-exhausted','unsupported-name'] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];
export type BudgetName = 'entries' | 'depth' | 'bytes-per-file' | 'bytes-total' | 'time';
export interface InventoryBudgets { readonly entries: number; readonly depth: number;
  readonly bytesPerFile: number; readonly bytesTotal: number; readonly timeMs: number; }
export const DEFAULT_BUDGETS: InventoryBudgets; // 200_000, 32, 1_048_576, 67_108_864, 60_000
export interface InventoryRepository { readonly id: string; readonly label: string;
  /** Path relative to the user root ('' for the root itself), '/'-separated. */
  readonly path: string; readonly nested: boolean; }
export interface InventoryManifest { readonly repositoryId: string;
  /** Relative to the user root. */ readonly path: string;
  readonly name: string; readonly framework: string | null;
  readonly dependencies: readonly string[]; readonly sha256: string; }
export interface SkipSummary { readonly count: number; readonly examples: readonly string[]; }
export interface InventoryResult {
  readonly version: 2;
  /** Canonical absolute user root; process-local, never serialized to outputs. */
  readonly root: string;
  readonly repositories: readonly InventoryRepository[];
  readonly manifests: readonly InventoryManifest[];
  readonly listedEntries: number;
  readonly bytesRead: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, SkipSummary>>>;
  readonly truncated: BudgetName | null;
  readonly diagnostics: readonly string[];
  readonly durationMs: number;
}
export interface InventoryRequest { readonly root: string;
  readonly knownHomes: readonly string[]; readonly budgets?: Partial<InventoryBudgets>;
  readonly signal?: AbortSignal; readonly now?: () => number;
  readonly onProgress?: (listedEntries: number) => void; }
export interface WorkspaceInventory { inspect(request: InventoryRequest): Promise<InventoryResult>; }
export function scanWorkspace(inventory: WorkspaceInventory, request: InventoryRequest): Promise<InventoryResult>;
```

- [ ] **Step 1:** Add the boundary regression test. Run `npx --yes pnpm@10.34.9 build && node --test scripts/tests/boundaries.test.mjs`. Expected: FAIL; the new case is not rejected yet.
- [ ] **Step 2:** Create the package, add the rule, and move the inventory and its tests unchanged. Add `inventory.ts` to application.
- [ ] **Step 3:** Run `npx --yes pnpm@10.34.9 check`. Expected: all green, the same Vitest count, and the boundary case passes.
- [ ] **Step 4:** Commit `refactor(discovery): move the manifest inventory into packages/discovery behind an application port`.

### Task 2: Gitignore matcher

**Files:**
- Create: `packages/discovery/src/gitignore.ts`
- Test: `packages/discovery/tests/gitignore.test.ts`

**Interfaces (produces):**

```ts
export interface IgnoreRules { /** Rules from one .gitignore, relative to its directory. */ }
export function parseGitignore(text: string, directory: string): IgnoreRules; // directory: '' or 'a/b'
/** Last matching rule across the stack wins; returns true when the path is ignored. */
export function isIgnored(stack: readonly IgnoreRules[], path: string, isDirectory: boolean): boolean;
```

The supported syntax:
- blank lines and `#` comments;
- `\#` and `\!` escapes;
- trailing spaces trimmed unless escaped;
- `!` negation;
- a leading `/` or an inner `/` anchors the pattern to the `.gitignore` directory, otherwise it matches at any depth;
- a trailing `/` matches directories only;
- `*`, `?`, `[...]` (including `[!...]`), and `**` as `**/`, `/**/` and `/**`.

Patterns compile to an anchored `RegExp` once, with no backtracking-prone constructs: `*` becomes `[^/]*` and `**` becomes `(?:.*/)?`.

- [ ] **Step 1: Write the failing tests.** Exact cases, `[pattern, path, isDir, ignored]`:
  - `['dist', 'a/dist', true, true]`
  - `['/dist', 'a/dist', true, false]`
  - `['build/', 'build', false, false]`
  - `['build/', 'build', true, true]`
  - `['*.log', 'x/y.log', false, true]`
  - `['docs/*.md', 'docs/a/b.md', false, false]`
  - `['docs/**/*.md', 'docs/a/b.md', false, true]`
  - `['**/tmp', 'a/b/tmp', true, true]`
  - `['a/**', 'a/b/c', false, true]`
  - `['[ab].txt', 'b.txt', false, true]`
  - `['[!ab].txt', 'b.txt', false, false]`
  - `['\\#x', '#x', false, true]`
  - `['# c', '# c', false, false]`

  Stack precedence: `['*.json', '!keep.json']` ignores `x.json`, not `keep.json`. In a nested stack, `parseGitignore('!pkg.json', 'sub')` re-includes `sub/pkg.json` after a root `*.json`. A rule from `sub/.gitignore` does not apply to `other/x`. Also: 10,000 `*` characters followed by `a` against a 10,000-character path finishes in under 50 ms (ReDoS guard).
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/discovery exec vitest run tests/gitignore.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `parseGitignore` and `isIgnored`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(discovery): in-repo gitignore matcher`.

### Task 3: Safe walker

**Files:**
- Create: `packages/discovery/src/walker.ts` (listing, reasons, budgets, nested repositories) and `packages/discovery/src/manifest.ts` (read, binary sniff, hash, redaction, framework detection moved from the old inventory).
- Create: `packages/discovery/src/filesystem-inventory.ts`, `export const filesystemInventory: WorkspaceInventory`.
- Delete: `packages/discovery/src/manifest-inventory.ts` and its old tests, once the new tests cover their behaviour (symlink not followed, malformed manifest diagnostic, redaction).
- Test: `packages/discovery/tests/walker.test.ts`, using `@archwise/test-fixtures` `createFixture` plus `symlink`, `mkfifo` and `chmod` where needed.

**Behaviour the implementer must honor (from the spec):**
- `lstat`-based. Symlinks are never followed. A symlink whose `realpath` resolves inside the root is `symlink`; one that resolves outside, or that is dangling, is `outside-root`.
- A directory containing `.git`, whether a directory or a file, below the root is listed as a nested repository with its ID. It counts once as `nested-repository` in the parent's skips, and the walk continues into it as that repository. Its own `.gitignore` stack starts fresh, plus the built-ins.
- A `.gitignore` is read only to compile rules. Its bytes count toward `bytesRead`, and it is never reported as a manifest.
- Gitignore negation never re-includes a built-in exclusion.
- Each listed entry increments `listedEntries` and calls `onProgress` at most every 250 entries.
- Budget checks:
  - `entries` is checked before listing;
  - `depth` applies to directories deeper than the budget, reported as `too-deep`;
  - `bytes-per-file` is checked with `lstat` size before reading, and an oversized file is `too-large`;
  - `bytes-total` and `time` are checked before each read or directory.

  On exhaustion, set `truncated` and count every remaining entry of the current directory as `budget-exhausted`. Deeper directories that were never opened are not counted.
- Manifests over 1 MiB are `too-large`. A manifest with NUL in its first 8 KiB is `binary`. A read or parse failure gives `unreadable`, and malformed JSON keeps the existing diagnostic `Invalid or unreadable manifest: <path>`.
- `signal.aborted` is checked before each directory and read. On abort, throw `signal.reason`, or a `DOMException('Aborted', 'AbortError')`.
- Directory entries are sorted with `compareCodeUnits`. Output arrays are sorted by path, and repositories by path.

- [ ] **Step 1: Write the failing tests**, one `test` each, asserting `skipped[reason].count` and the `examples`:
  - built-in and gitignore precedence, including `!node_modules/x` having no effect;
  - a symlink inside the root and a symlink cycle (`a -> .`) give `symlink`, and the scan terminates;
  - an escaping symlink and a symlinked `package.json` pointing outside give `outside-root`, and the target content never appears;
  - a nested repository via a `.git` directory and via a `.git` file: `repositories` has 2 entries, the nested ID is `repo-` + the first 16 hex characters of `sha256('libs/sub')`, and the manifest's `repositoryId` matches;
  - a 1 MiB + 1 byte manifest gives `too-large`; a manifest with `\0` gives `binary`;
  - an unreadable directory (`chmod 000`, skipped on Windows) gives `unreadable`;
  - a FIFO (skipped on Windows) gives `special-file`;
  - Unicode names `café/package.json` and `日本/package.json` are preserved; a POSIX name containing `\` gives `unsupported-name` (skipped on Windows);
  - depth budget 2 gives `too-deep`;
  - entries budget 5 gives `truncated: 'entries'` plus `budget-exhausted`;
  - bytes-total budget gives `truncated: 'bytes-total'`;
  - an injected `now` advancing 61 s gives `truncated: 'time'`;
  - a pre-aborted signal rejects with name `AbortError`, and an abort from `onProgress` also rejects;
  - the same tree scanned twice gives `deepEqual` results excluding `durationMs`;
  - `sha256` equals `createHash('sha256')` of the file bytes;
  - redaction of names and dependencies, with known homes;
  - examples are capped at 20 and sorted.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/discovery exec vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement the walker, the manifest reader and `filesystemInventory`.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(discovery): budgeted, explainable single-root inventory`.

### Task 4: Graph and revision from the new result

**Files:**
- Modify: `apps/cli/src/graph.ts`. It consumes `InventoryResult` v2. Node IDs are unchanged. Sorting uses `compareCodeUnits`. `inspectedEntries` becomes `listedEntries`, and the view field name stays `inspectedEntries` to keep the shape.
- Modify: `apps/cli/src/revision.ts`:
  - `repositories` lists every `InventoryRepository`;
  - evidence `repositoryId` and `path` are relative to that repository;
  - revision node IDs keep `mod-<hash(path relative to user root)>`;
  - coverage has one entry per repository, `partial` when `truncated !== null` or the diagnostics are non-empty;
  - the revision status is derived the same way;
  - the root label rules from Global Constraints apply.
- Test: `apps/cli/tests/graph.test.ts` and `apps/cli/tests/revision.test.ts`.

- [ ] **Step 1: Write the failing tests:**
  - A fixture without nested repositories gives the same node IDs and `projectSignature` as a hard-coded expectation computed on `main` before this task. Capture the expected values in the test from the current implementation first.
  - A submodule fixture keeps node ID `package:libs/sub/pkg/package.json`, while the revision has 2 repositories and evidence `{repositoryId: repo-…, path: 'pkg/package.json'}`.
  - `truncated: 'entries'` gives revision `status: 'partial'` and coverage `partial`.
  - A root equal to `knownHomes[0]` gives the repository label `home`.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/cli exec vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): build graph and revision from the safe inventory`.

### Task 5: Scan records in the store

**Files:**
- Modify: `packages/application/src/ports.ts`:

  ```ts
  interface StoredScan {
    id: string; workspaceId: string; revisionId: string;
    startedAt: string; finishedAt: string;
    listedEntries: number; bytesRead: number;
    skipped: Readonly<Partial<Record<SkipReason, number>>>;
    truncated: BudgetName | null;
    analyzers: readonly { id: string; version: string }[];
  }
  interface ScanRepository {
    record(scan: StoredScan): void;
    latest(workspaceId: string): StoredScan | null;
  }
  ```

  Add `Store.scans`, and add the `IdGenerator` prefix `'scan'`.
- Modify: `packages/application/src/memory-store.ts` and `packages/application/src/testing/store-contract.ts`. Contract cases: record then latest; latest picks the newest `finishedAt`, then the highest ID; the store holds no path-bearing field.
- Modify: `packages/application/src/session-service.ts`:
  - `DiscoveryInput` gains an optional `scan: Omit<StoredScan, 'id'|'workspaceId'|'revisionId'>`, recorded after the revision is resolved, whether reused or new.
  - Add `lastScan(): StoredScan | null`.
- Modify: `packages/storage/src/migrations.ts` to add version 2:

  ```sql
  CREATE TABLE scans (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id),
    revision_id TEXT NOT NULL REFERENCES revisions(id),
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    summary TEXT NOT NULL
  );
  CREATE INDEX scans_by_workspace ON scans(workspace_id, finished_at);
  ```

  `summary` holds the JSON of the counts. `packages/storage/src/sqlite-store.ts` gains the `scans` repository.
- Test: `packages/storage/tests/lifecycle.test.ts`. A v1 file migrates to v2, with a backup `archwise.db.backup-v1-*`, and its sessions still list. Plus the SQLite contract run.

- [ ] **Step 1:** Write the failing contract, migration and `SessionService` tests (open with `scan` records it; `lastScan()` returns it).
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/application --filter @archwise/storage exec vitest run`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(store): record scan metadata (schema v2)`.

### Task 6: CLI summary, `--json`, progress, errors and cancellation

**Files:**
- Modify: `apps/cli/src/bin.ts`, `apps/cli/src/store-runtime.ts` (pass `scan`; `formatSessionList` gains `Last scan: <finishedAt>`) and `apps/cli/src/index.ts` (help text).
- Create: `apps/cli/src/inventory-output.ts`:

  ```ts
  formatInventorySummary(result: InventoryResult): string
  portableInventory(result: InventoryResult): object
  rootErrorMessage(error: unknown, input: string): string | null
  runScan(inventory: WorkspaceInventory, request: InventoryRequest):
    Promise<{ kind: 'done'; result: InventoryResult } | { kind: 'cancelled' }>
  ```
- Test: `apps/cli/tests/inventory-output.test.ts`, `scripts/tests/cli-smoke.test.mjs` and `scripts/tests/session-store-integration.test.mjs`.

**Exact copy:**
- Root errors, all exit code 2:
  - `Workspace root not found: <input>. Pass an existing directory with --path.`
  - `Workspace root is not a directory: <input>. Pass a directory with --path.`
  - `Workspace root is not readable: <input>. Check its permissions.`

  `<input>` is what the user typed; the CLI prints it back to their own terminal.
- Summary header: `Archwise — local inventory (<n> manifests, <listed> entries, <repos> repositories)`. Then one line per manifest, as today, then `Skipped: <reason> <count>, …`, in `SKIP_REASONS` order and omitting zeros. Then, when truncated: `Scan truncated: <budget> budget reached. Results are partial.`
- Progress (only when `process.stderr.isTTY`): `\rScanning… <listed> entries`, cleared at the end.
- Ctrl+C during the scan: `AbortController.abort()`, print `Scan cancelled.` to stderr, exit 130, and start no server.
- `portableInventory`: an allowlist of `version`, `repositories` (`id`, `label`, `path`, `nested`), `manifests` (with `sha256`), `listedEntries`, `skipped`, `truncated` and `diagnostics`. No `root` and no `durationMs`.

- [ ] **Step 1: Write the failing tests:**
  - unit tests for the helpers, including that `JSON.stringify(portableInventory(result))` never contains `result.root`;
  - smoke: missing root gives exit code 2 and the exact message; a file root gives exit code 2; `--json` has `version: 2` and `skipped`;
  - integration: the existing byte-identical snapshot extended with `mtimeMs` per file still matches after `--json`, `--graph` and `--serve`;
  - integration: `--sessions` after one `--serve` run prints `Last scan:`;
  - cancellation: a slow scan cannot be injected into a spawned CLI, so a unit test covers it. `runScan(inventory, request)` in `inventory-output.ts` returns `{ kind: 'done', result } | { kind: 'cancelled' }`. With an inventory that rejects with `AbortError`, it returns `cancelled`, and `bin.ts` maps that to `Scan cancelled.` and exit code 130.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/cli exec vitest run && node --test scripts/tests/*.test.mjs`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run it again. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): inventory summary, portable JSON v2, progress and cancellation`.

### Task 7: Benchmark and docs

**Files:**
- Create: `scripts/bench-inventory.mjs`. It generates synthetic trees of 1k, 20k and 200k entries in a temporary directory (one `package.json` per 100 files, nested folders 6 deep), runs `filesystemInventory` from `packages/discovery/dist`, prints a Markdown table of entries and ms, then deletes the trees. It is not part of `pnpm check`. Add a `bench:inventory` script to the root `package.json`.
- Modify:
  - `docs/discovery.md`: budgets, ignore precedence, the skip-reason table including `unsupported-name`, nested repositories, cancellation, benchmark results;
  - `docs/alpha-testing.md`: summary, truncation, Ctrl+C;
  - `docs/sessions.md`: last scan, schema v2;
  - `docs/security.md`: symlinks and special files are never followed or opened;
  - `apps/cli/README.md` and `packages/discovery/README.md`;
  - `docs/implementation-roadmap.md`: Phase 3 in progress, and the current-state row.
- [ ] **Step 1:** Run `npx --yes pnpm@10.34.9 build && node scripts/bench-inventory.mjs`. Expected: a table with three rows and no error. Paste it into `docs/discovery.md`.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 check` and the browser smoke. Expected: green.
- [ ] **Step 3:** Commit `docs: safe inventory budgets, skip reasons and benchmark`.
