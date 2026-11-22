# Multi-Repository Workspace (Phase 3, PR 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one Archwise run cover several repositories: `--repo` (repeatable), `--path` as its alias and a reviewed `--workspace` file. The result is one graph with cross-repository edges, repository labels in the Studio, a scan summary, and the Phase 3 exit gate closed.

**Architecture:**
- **`packages/schemas`:** validates the `archwise.workspace` v1 file.
- **`packages/application`:**
  - the inventory port takes several roots;
  - `workspaceKey()` derives the store identity from the canonical roots.
- **`packages/discovery`:**
  - a new `roots.ts` resolves, deduplicates, identifies and labels the user roots;
  - the walker scans them in ID order, with shared budgets.
- **`apps/cli`:**
  - parses the new flags and loads the workspace file;
  - builds the multi-root view and revision IDs;
  - prints a summary per repository;
  - serves `/api/v1/scan`.
- **`apps/web`:** shows each node's repository and a scan summary in the header.
- **No store migration** (Ruling P1).

**Tech Stack:** TypeScript, Node 24/26, `node:fs/promises`, `node:crypto`, zod (already in `@archwise/schemas`), Svelte 5 with `@xyflow/svelte`, Vitest, `node:test`, Playwright (browser smoke only).

**Spec:** `docs/superpowers/specs/2026-11-19-safe-workspace-inventory-design.md` (PR 2 of its Delivery section). PR 1 is merged as #14 and is the baseline.

## Global Constraints

- **No new npm dependency.**
- **Safety:**
  - nothing runs or writes inside any root;
  - symlinks are never followed;
  - the only file contents read are `package.json` and `.gitignore` files.
- **No absolute paths** reach `--json`, `--graph`, `/api/v1/*`, the revision or the browser, for multi-root workspaces as well.
- **Single-root compatibility (a single user root, with or without nested repositories):**
  - the workspace identity is the canonical root path;
  - view node IDs are `package:<path relative to the root>`;
  - revision node IDs are `mod-<hash(path)>`;
  - the root repository ID is `repo-root`.

  The view graph JSON stays byte-identical to PR 1 (`apps/cli/tests/fixtures/compat-baseline.json` must not change).
- **Multi-root (two or more user roots after deduplication):**
  - each user root's ID is `repo-` plus the first 16 hex characters of SHA-256 over its path relative to the workspace's common ancestor, `/`-separated;
  - nested repositories hash their path relative to the common ancestor;
  - view node IDs are `package:<user-root ID>/<manifest path relative to that user root>`;
  - revision node IDs are `mod-<hash(<user-root ID>/<path>)>`.
- **Repositories are scanned in code-unit order of the user-root IDs.** Budgets (200,000 entries, depth 32, 1 MiB per file, 64 MiB in total, 60 s) are workspace totals.
- **The workspace file** is `{ "format": "archwise.workspace", "version": 1, "repositories": [{ "path": string, "label"?: string }] }`.
  - Unknown fields are rejected.
  - There are 1 to 64 repositories.
  - Relative paths resolve against the directory of the file's real path, and `..` is allowed.
  - An entry that resolves to a filesystem root is rejected.
  - Archwise never writes this file.
- **`--workspace` cannot be combined with `--repo` or `--path`.** `--repo` and `--path` may be mixed and repeated.
- **Errors:** root and workspace-file errors exit with code 2 and the exact messages listed in Task 5. Ctrl+C exits with code 130.
- **Ordering** uses `compareCodeUnits` and never `localeCompare`.
- **Tooling:** use `npx --yes pnpm@10.34.9`. Never run Prettier on `docs/`.

## Rulings made while planning (carry into the ledger)

- **P1. Workspace identity needs no schema change.**
  - The `workspaces.root_path` column (port field `Workspace.rootPath`) stores `workspaceKey(roots)`:
    - the canonical path for one root;
    - `JSON.stringify(sortedRoots)` for several.
  - A JSON array starts with `[`, so it can never equal an absolute path, and no migration or backup is needed.
  - Cost if wrong: a later migration that splits the key, which is mechanical.
- **P2. `repository` appears on view nodes only in multi-root workspaces.**
  - Adding it to a single root that has submodules would change that root's view JSON, so its next run would create a new revision. A resumed session would then show the "architecture changed" notice for no real change.
  - Nested repositories still appear in the revision, the CLI summary and the scan summary.
  - Cost if wrong: submodule projects don't see a repository chip on each node.
- **P3. Prefixed examples and diagnostics.** In multi-root workspaces, skip examples and path-bearing diagnostics are prefixed with `<user-root label>/`. User-root labels are unique, so these strings are unambiguous. A single root is unchanged. Cost if wrong: a display format.
- **P4. Unicode-equivalent duplicate roots.** On macOS, duplicate user roots are compared after `normalize('NFC')`. Inside a root, names are kept as-is, and APFS cannot hold two NFC-equal names in one directory. Cost if wrong: one more comparison site.
- **P5. Roots with no common ancestor.** When the roots have no common ancestor, such as Windows roots on different drives, each user root's hash input is its full canonical path: `/`-separated, with the drive letter lowercased. IDs are hashes, so no path leaks. Cost if wrong: IDs change for that rare setup.
- **P6. Scan-summary endpoint.**
  - The scan summary is served at the new endpoint `GET /api/v1/scan`. It is not a field of the graph: the counts change with every added file, and putting them into the view would create a new revision on every run.
  - The endpoint uses the same authentication and headers as `/api/v1/graph`.
  - Cost if wrong: one route moves.

## Review Focus

1. **The budget runs out in the first repository.** Every later repository must still be listed, with its label, `reached: false`, zero counts, the diagnostic `Repository not scanned: <label>. A budget ran out first.`, revision coverage `partial`, and a "not scanned" line in the summary and the Studio. Owner: Task 3.
2. **Overlapping roots** (`--repo . --repo ./packages/x`). The inner root is reported once as `nested-repository` in the outer one. It is scanned once, as its own user root, and its manifests are not duplicated. Owner: Task 3.
3. **The same package name in two repositories.** Two distinct nodes, the "Ambiguous package name" diagnostic with prefixed paths, and no edge. Owner: Task 4.
4. **A single root with a Git submodule after the upgrade.** The view JSON is identical to PR 1 (no `repository` field), and a resumed session shows no "architecture changed" notice. Owner: Task 4 (compat test) and Task 7 (session-store integration).
5. **A workspace-file entry `"../../../.."` that climbs to `/`,** or a symlink to `/`. It is rejected with the filesystem-root message before any scan. An entry such as `"../sibling"` is accepted. Owner: Task 5.

---

### Task 1: `archwise.workspace` v1 schema

**Files:**
- Create: `packages/schemas/src/workspace-file.ts`, exported from `packages/schemas/src/index.ts`.
- Test: `packages/schemas/tests/workspace-file.test.ts`

**Interfaces (produces):**

```ts
export interface WorkspaceFileEntry { readonly path: string; readonly label?: string }
export interface WorkspaceFile { readonly format: 'archwise.workspace'; readonly version: 1;
  readonly repositories: readonly WorkspaceFileEntry[] }
export type WorkspaceFileResult =
  | { readonly ok: true; readonly value: WorkspaceFile }
  | { readonly ok: false; readonly problem: string };
export const MAX_WORKSPACE_REPOSITORIES = 64;
export function parseWorkspaceFile(text: string): WorkspaceFileResult;
```

- [ ] **Step 1: Write the failing tests.** `test.each` over `[input, problem]`. The `problem` is the first issue only, as `<field path> <condition>`:
  - `'{'` gives `file is not valid JSON`;
  - `'[]'` gives `file must be a JSON object`;
  - a missing `format` gives `format must be "archwise.workspace"`;
  - `version: 2` gives `version must be 1`;
  - `repositories: []` gives `repositories must list 1 to 64 entries`;
  - 65 entries give the same message;
  - `{path: 1}` gives `repositories[0].path must be a non-empty string`;
  - `{path: ''}` gives the same message;
  - `{path: 'a', label: 'x'.repeat(200)}` gives `repositories[0].label is not a valid label`;
  - a label that is a home path, `/Users/alex/x`, gives the same message;
  - `{path: 'a', extra: 1}` gives `repositories[0].extra is not allowed`;
  - a top-level `extra` gives `extra is not allowed`.

  One happy case keeps the entry order and leaves out a missing label. Labels are checked with `isValidLabel` from `@archwise/domain`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/schemas test`. Expected: FAIL, because the module is not found.
- [ ] **Step 3: Implement it.** Use a `z.strictObject` schema. Map the first zod issue to the messages above with a small `switch` on the issue code. Never surface zod's own text.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(schemas): archwise.workspace v1 file format`.

### Task 2: Multi-root port types, `workspaceKey` and root resolution

**Files:**
- Modify: `packages/application/src/inventory.ts` and `packages/application/src/ports.ts` (doc comment on `Workspace.rootPath`).
- Create: `packages/application/src/workspace-key.ts`, exported.
- Create: `packages/discovery/src/roots.ts`, exported from the index.
- Test: `packages/application/tests/workspace-key.test.ts` and `packages/discovery/tests/roots.test.ts`.

**Interfaces (produces; additive in this task, so `walkWorkspace` still compiles):**

```ts
// application/inventory.ts
export interface RootRequest { readonly path: string; readonly label?: string }
export interface InventoryProgress { readonly listedEntries: number;
  readonly repository: string; readonly elapsedMs: number }
export class InventoryRootError extends Error { readonly reason: InventoryRootFailure;
  /** Index into the request's roots. */ readonly index: number;
  constructor(reason: InventoryRootFailure, index?: number) } // index defaults to 0
// application/workspace-key.ts
/** One root: the root itself. Several: JSON of the code-unit-sorted roots (Ruling P1). */
export function workspaceKey(roots: readonly string[]): string;
// discovery/roots.ts
export interface ResolvedRoot { readonly id: string; readonly label: string;
  /** Canonical absolute path; process-local. */ readonly absolute: string;
  /** Hash input for nested repository IDs: '' for a single root. */ readonly idBase: string }
export async function resolveRoots(requests: readonly RootRequest[],
  knownHomes: readonly string[]): Promise<ResolvedRoot[]>; // sorted by id
export function rootIdBases(roots: readonly string[], pathApi: typeof import('node:path').posix):
  string[]; // same order as input
export function makeLabelsUnique(items: readonly { readonly label: string;
  readonly parent: string; readonly pinned?: boolean }[]): string[];
```

- [ ] **Step 1: Write the failing tests.**
  - **`workspaceKey`:**
    - `['/a']` gives `'/a'`;
    - `['/b','/a']` gives `'["/a","/b"]'`;
    - the result is independent of the input order.
  - **`rootIdBases`:**
    - posix `['/w/api','/w/web']` gives `['api','web']`;
    - `['/w','/w/libs/x']` gives `['','libs/x']`;
    - win32 `['C:\\w\\a','D:\\b']` gives `['c/w/a','d/b']` (Ruling P5);
    - win32 `['C:\\w\\a','C:\\w\\b']` gives `['a','b']`.
  - **`makeLabelsUnique`:**
    - `[{label:'api',parent:'services'},{label:'api',parent:'web'}]` gives `['services/api','web/api']`;
    - a pinned item keeps its label;
    - when the parents are equal too, the second becomes `'api #2'`;
    - results are truncated to `LIMITS.label` code points.
  - **`resolveRoots`,** on temporary directories:
    - one root has ID `repo-root` and `idBase ''`;
    - two sibling roots have IDs `repo-<sha256('api').slice(0,16)>` and the like, sorted by ID;
    - the same directory given twice, or through a symlink, is merged and keeps the first label;
    - a request label wins over the directory name;
    - a root equal to the home directory is labelled `home`;
    - a missing second root throws `InventoryRootError` with `{reason:'not-found', index:1}`;
    - a file gives `not-directory`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/application --filter @archwise/discovery test`. Expected: FAIL, because the imports are missing.
- [ ] **Step 3: Implement it.**
  - `resolveRoots` reuses the walker's `resolveRoot` and `labelOf`; move them into `roots.ts` and export them for the walker.
  - Deduplication compares the canonical paths, NFC-normalized on `darwin` (Ruling P4).
  - The common ancestor is computed per `pathApi` over the segments. With no common ancestor, apply Ruling P5.
  - User-root labels go through `makeLabelsUnique`, with each root's parent directory name as `parent`.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(discovery): resolve, identify and label several user roots`.

### Task 3: The walker scans several roots with shared budgets

**Files:**
- Modify: `packages/discovery/src/walker.ts` and `packages/application/src/inventory.ts`. The following changes are breaking:
  - `InventoryRequest.root: string` becomes `roots: readonly RootRequest[]`;
  - `onProgress` takes an `InventoryProgress`;
  - `InventoryResult.root` becomes `roots: readonly string[]`, the canonical paths sorted by user-root ID;
  - `InventoryRepository` gains `rootId`, `reached`, `listedEntries`, `manifests` and `skipped: Partial<Record<SkipReason, number>>`;
  - `InventoryManifest` gains `rootId`.
- Modify, to keep compiling (a minimal adaptation, single root only, finished in Task 5):
  - `apps/cli/src/bin.ts`: `roots: [{ path: command.path }]`, `rootPath: result.roots[0]!`, and the progress callback;
  - `apps/cli/tests/*` fixtures, which add the new fields;
  - `scripts/bench-inventory.mjs`.
- Test: `packages/discovery/tests/walker.test.ts`, in a new `describe('several roots')`.

**Interfaces (produces):**
- `InventoryRepository`:
  - `rootId` is the ID of the user root that contains the repository, or its own ID for a user root;
  - `path` is relative to that user root;
  - `reached` is false only for a user root that a budget left unscanned.
- Repositories and manifests are sorted by `(rootId, path)` in code-unit order.

- [ ] **Step 1: Write the failing tests,** with fixtures built in temporary directories.
  - **Two sibling roots, `api` and `web`, each with `package.json`:**
    - `roots` has 2 entries;
    - each manifest's `rootId` and `repositoryId` equal its root's ID;
    - each manifest `path` is `'package.json'`;
    - per-repository `listedEntries` and `manifests` sum to the totals.
  - **Overlap,** where the roots are `w` and `w/libs/x`:
    - `skipped['nested-repository'].examples` contains `'w/libs/x'` (Ruling P3 prefix);
    - the inner manifest appears once, with `rootId` equal to the inner ID.
  - **The budget runs out in the first root:** `budgets: { entries: 3 }`, where the first root (in ID order) has 10 files.
    - The second root is `reached: false`, with zero counts.
    - `diagnostics` contains `Repository not scanned: <label>. A budget ran out first.`
    - `truncated` is `'entries'`.
  - **Prefixed examples,** multi-root only:
    - a `node_modules` in root `web` is reported as `web/node_modules`;
    - the single-root tests that already exist still pass unchanged.
  - **Nested repository in a multi-root workspace:** its ID hashes `<root idBase>/<path>`.
  - **Progress:** `onProgress` receives the label of the repository being scanned.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/discovery test`. Expected: FAIL on the new tests, and on type errors until the types change.
- [ ] **Step 3: Implement it.**
  - Change the types, then make `walkWorkspace` call `resolveRoots` and visit each user root in ID order with the shared counters.
  - The absolute paths of the other user roots go into a set. A directory in that set is skipped as `nested-repository` and not descended into.
  - Count `listedEntries`, `manifests` and `skipped` per repository, in the current frame's repository.
  - After a `Truncated` error, mark every user root not yet visited `reached: false`.
  - Run `makeLabelsUnique` over the nested repositories, with the user roots pinned.
  - Then adapt `bin.ts`, the CLI test fixtures and the bench script so that `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 test` is green.
- [ ] **Step 4: Run** `npx --yes pnpm@10.34.9 --filter @archwise/discovery test`, then the full `test`. Expected: PASS. `apps/cli/tests/compat.test.ts` is unchanged and green.
- [ ] **Step 5: Commit** with `feat(discovery): scan several roots with shared budgets and per-repository counts`.

### Task 4: Multi-root graph and revision IDs, cross-repository edges

**Files:**
- Modify: `apps/cli/src/graph.ts` and `apps/cli/src/revision.ts`.
- Test: `apps/cli/tests/graph.test.ts`, `apps/cli/tests/revision.test.ts` and `apps/cli/tests/compat.test.ts`. Add a single root with a nested repository to the compat test; the baseline file is not regenerated.

**Interfaces (produces):**

```ts
// graph.ts
export interface ArchitectureNode { /* existing fields */
  readonly repository?: { readonly id: string; readonly label: string } } // multi-root only (P2)
export function viewNodeId(manifest: Pick<InventoryManifest,'rootId'|'path'>, multiRoot: boolean): string;
// revision.ts
export interface RevisionScan { readonly roots: number; /* existing fields */
  readonly manifests: readonly { readonly rootId: string; readonly repositoryId: string;
    readonly path: string }[] }
```

- [ ] **Step 1: Write the failing tests.**
  - **Two roots, where `web` depends on `@shop/api` in root `api`:**
    - the node IDs are `package:<apiId>/package.json` and `package:<webId>/package.json`;
    - there is one edge, `dependency:package:<webId>/package.json->package:<apiId>/package.json`;
    - each node has a `repository` with `{id,label}`;
    - each evidence `path` is `'package.json'`.
  - **The same name in both roots:** the diagnostic is `Ambiguous package name: @shop/x (api/package.json, web/package.json)`, there is no edge, and there are two nodes.
  - **Revision:**
    - the multi-root node ID is `mod-<sha256('<apiId>/package.json').slice(0,16)>`;
    - `repositoryId` is the owning repository;
    - `repositories` lists every repository, including one that was not reached;
    - `status` is `'partial'` when a repository was not reached;
    - the revision passes `createRevision`.
  - **Compat:** a single root with a `.git` submodule produces no `repository` field and node IDs equal to `package:<path>`. The existing baseline assertions stay byte-equal.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/cli test`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - `multiRoot` is `inventory.roots.length > 1`.
  - Sort nodes by ID; for a single root this is equivalent to sorting by path.
  - Name resolution stays global across all manifests, which is what creates the cross-repository edges.
  - Diagnostics prefix paths with the user-root label in multi-root workspaces.
  - `buildGraphRevision` maps each view node ID to its manifest through `viewNodeId`. Hash `<rootId>/<path>` for node and evidence IDs only when `scan.roots > 1`.
- [ ] **Step 4: Run again.** Expected: PASS, with `compat.test.ts` unchanged and green.
- [ ] **Step 5: Commit** with `feat(cli): multi-root graph IDs and cross-repository edges`.

### Task 5: CLI flags, the workspace file, messages, the summary, the store key

**Files:**
- Modify: `apps/cli/src/index.ts` (parse and help), `apps/cli/src/bin.ts`, `apps/cli/src/inventory-output.ts` and `apps/cli/src/store-runtime.ts`.
- Create: `apps/cli/src/workspace-file.ts`.
- Test: `apps/cli/tests/cli.test.ts`, `inventory-output.test.ts`, `store-runtime.test.ts` and a new `workspace-file.test.ts`.

**Interfaces (produces):**

```ts
// index.ts — CliCommand 'inspect': replace `path` with
readonly roots: readonly { readonly path: string; readonly flag: '--path' | '--repo' }[]; // default [{path:'.', flag:'--path'}]
readonly workspace: string | null;
// workspace-file.ts
export class WorkspaceFileError extends Error {} // message is the stable user-facing text
export async function loadWorkspaceFile(file: string): Promise<readonly RootRequest[]>; // absolute, canonical
// inventory-output.ts
export function rootErrorMessage(error: unknown, roots: readonly { path: string; flag: string }[]): string | null;
export interface ScanSummary { readonly version: 1; readonly listedEntries: number;
  readonly skipped: Readonly<Partial<Record<SkipReason, number>>>; readonly truncated: BudgetName | null;
  readonly repositories: readonly { readonly id: string; readonly label: string; readonly nested: boolean;
    readonly reached: boolean; readonly listedEntries: number; readonly manifests: number;
    readonly skipped: Readonly<Partial<Record<SkipReason, number>>> }[] }
export function scanSummary(result: InventoryResult): ScanSummary;
// store-runtime.ts — PrepareStoreOptions.rootPath becomes
readonly rootPaths: readonly string[];
```

**Exact messages** (exit code 2):
- `--workspace cannot be combined with --repo or --path.`
- `--repo expects a directory.` This is the message when `--repo` has no value or its value starts with `--`. `--path` gets the same check with its own name.
- `Workspace root not found: <input>. Pass an existing directory with <flag>.`
- `Workspace root is not a directory: <input>. Pass a directory with <flag>.`
- `Workspace root is not readable: <input>. Check its permissions.`
- `Workspace file not found: <file>. Pass an existing file with --workspace.`
- `Workspace file is not readable: <file>. Check its permissions.`
- `Workspace file is too large: <file>. The limit is 1 MiB.`
- `Workspace file is not valid: <file>: <problem>.` The `<problem>` comes from Task 1.
- `Workspace entry <n> not found: <entry path>. Fix repositories[<n>].path in <file>.`
- `Workspace entry <n> is not a directory: <entry path>. Fix repositories[<n>].path in <file>.`
- `Workspace entry <n> is a filesystem root: <entry path>. Point it at a repository directory.`

`<n>` is 0-based. `<input>`, `<file>` and `<entry path>` are echoed exactly as the user typed them.

**Summary format** (more than one repository; a single repository keeps the PR 1 output exactly):

```text
Archwise — local inventory (2 manifests, 120 entries, 2 repositories)
Repository api: 1 manifest, 80 entries, skipped ignored-builtin 3
- package.json: @shop/api [fastify]
Repository web: not scanned, a budget ran out first.
Skipped: ignored-builtin 3
Scan truncated: entries budget reached. Results are partial.
```

`--json` repositories gain `rootId`, `reached`, `listedEntries`, `manifests` and `skipped` (counts). `version` stays 2, because the change is additive. Progress line: `\rScanning <label>… <n> entries, <s> s`.

- [ ] **Step 1: Write the failing tests.**
  - **Parse:**
    - `--repo a --repo b` gives two roots with flag `--repo`;
    - `--path a --repo b` gives both;
    - `--workspace w.json --repo a` gives the combine error;
    - `--repo` with no value gives its error;
    - the default is `[{path:'.',flag:'--path'}]`;
    - `--help` mentions `--repo` and `--workspace`.
  - **Workspace file,** on temporary directories:
    - a relative path resolves against the file's directory;
    - `../sibling` is accepted;
    - an absolute path is accepted;
    - `"../../../../../../../../.."` gives the filesystem-root message;
    - a symlink entry that points to `/` gives the same message;
    - each of the other messages above is produced exactly once by its own fixture.
  - **`rootErrorMessage`** uses `error.index` to pick the input and flag.
  - **Summary:** the multi-repository example above, verbatim, and a single repository unchanged.
  - **`scanSummary`** contains no `/`-leading path and no `examples`.
  - **`prepareStore`:**
    - two roots record a workspace whose key is `workspaceKey(rootPaths)`;
    - a `dataDir` inside the second root disables the store with the existing notice.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/cli test`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - `loadWorkspaceFile`:
    - `realpath`s the file;
    - checks its size (at most 1 MiB) before reading;
    - parses it with `parseWorkspaceFile`;
    - resolves each entry with `resolve(dirname(realFile), entry.path)` followed by `realpath`;
    - rejects an entry when `parse(p).root === p`.
  - `bin.ts`:
    - builds `RootRequest[]` from the flags or the file;
    - prints `Workspace: <label>, <label>…` to stderr before scanning when `--workspace` is used, as the spec requires;
    - passes `rootPaths: result.roots` and the new progress line.
- [ ] **Step 4: Run again.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat(cli): --repo, --workspace, per-repository summary and multi-root store identity`.

### Task 6: `/api/v1/scan` and the Studio

**Files:**
- Modify: `apps/cli/src/local-server.ts`. `ServerOptions` gains `scan?: ScanSummary`. `bin.ts` passes `scanSummary(result)`.
- Modify: `apps/web/src/graph-types.ts`, `apps/web/src/ArchitectureCanvas.svelte` and `apps/web/src/App.svelte`.
- Create: `apps/web/src/scan-summary.ts`.
- Test: `apps/cli/tests/local-server.test.ts`, `apps/web/src/graph-types.test.ts` and a new `apps/web/src/scan-summary.test.ts`.

**Interfaces (produces):**

```ts
// web/graph-types.ts — GraphNode gains
readonly repository?: { readonly id: string; readonly label: string };
// web/scan-summary.ts
export function isScanSummary(value: unknown): value is ScanSummaryView; // mirrors the CLI ScanSummary
export function scanHeadline(summary: ScanSummaryView): string;
export function repositoryLines(summary: ScanSummaryView): string[];
export function nodeDisplayLabel(node: GraphNode): string;
```

- [ ] **Step 1: Write the failing tests.**
  - **Server:**
    - `GET /api/v1/scan` with the session cookie returns 200 and the summary;
    - without the cookie it returns 401;
    - with no scan option it returns 404 `{error:'Not found'}`.
  - **`isGraph`:**
    - accepts a node with `repository: {id,label}`;
    - accepts a node without it;
    - rejects `repository: 'x'`.
  - **`scanHeadline`:**
    - two repositories and 120 entries give `Scan · 2 repositories · 120 entries`;
    - a truncated scan adds ` · partial`.
  - **`repositoryLines`:**
    - a scanned repository gives `api: 1 manifest, 80 entries`;
    - an unscanned one gives `web: not scanned, a budget ran out first`.
  - **`nodeDisplayLabel`:**
    - `@shop/api · fastify` without a repository;
    - `@shop/api · fastify · api` with one.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 --filter @archwise/cli --filter @archwise/web test`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - **The route** sits next to `/api/v1/graph`.
  - **`App.svelte`:**
    - fetches `/api/v1/scan` with the same options as the graph request, and ignores a 404;
    - shows `<details class="scan-summary">` in `.header-status` with `<summary>{scanHeadline}</summary>`, then the repository lines, a `Skipped: …` line and the truncation sentence from Task 5;
    - the inspector gains `Repository: <label>` above the evidence when the node has a `repository`;
    - the package list in the sidebar uses `nodeDisplayLabel`.
  - **`ArchitectureCanvas.svelte`:** discovered nodes use `nodeDisplayLabel` for `data.label`.
  - **CSS:** style the summary with the header's existing tokens in `studio.css`, and add no new colours.
- [ ] **Step 4: Run again,** then `npx --yes pnpm@10.34.9 --filter @archwise/web build`. Expected: PASS, and the build succeeds.
- [ ] **Step 5: Commit** with `feat(web): repository labels and scan summary in the Studio`.

### Task 7: End-to-end, browser smoke, docs and the Phase 3 exit gate

**Files:**
- Modify:
  - `scripts/tests/cli-smoke.test.mjs`, where `--repo .` is no longer "Unsupported";
  - `scripts/tests/alpha-integration.test.mjs`;
  - `scripts/tests/session-store-integration.test.mjs`;
  - `scripts/browser-smoke.mjs`.
- Docs:
  - `docs/discovery.md`;
  - `docs/alpha-testing.md`;
  - `docs/sessions.md`;
  - `docs/security.md`;
  - `apps/cli/README.md`;
  - `packages/discovery/README.md`;
  - `docs/implementation-roadmap.md`;
  - every doc that lists the API routes (`grep -rn "/api/v1/graph" docs apps/*/README.md`).

- [ ] **Step 1: Write the failing integration tests.**
  - **cli-smoke:**
    - `--repo a --repo b --json`, where `b` depends on `a`, returns exit 0, two repositories and no absolute path or home directory in stdout;
    - `--graph` contains the cross-repository edge;
    - `--workspace` with a bad file returns exit 2 and the exact message;
    - `--workspace x --repo y` returns exit 2.
  - **alpha-integration:** a multi-root scan leaves both roots byte-identical, including file modification times, using the existing snapshot helper.
  - **session-store-integration:**
    - a single root with a `.git` submodule, run twice with `--sessions`, records one revision;
    - `--repo a --repo b` gets a workspace distinct from `--repo a` alone.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 build && node --test scripts/tests/`. Expected: the new cases FAIL until the CLI is built from Tasks 3 to 6. If they pass on the first run, record a Ruling (built-CLI tests not watched fail, as in PR 1).
- [ ] **Step 3: Browser smoke.** After the existing flow, start a second server with `--repo <api> --repo <web>` in fresh temporary directories, then:
  - click `Explore · Inspect`;
  - wait for the node texts `@smoke/api · Package · api` and `@smoke/web · Package · web`;
  - open the header summary and wait for `api: 1 manifest`;
  - assert that one edge renders (`.svelte-flow__edge` count of at least 1).

  Run `ARCHWISE_BROWSER_CHANNEL=chrome ARCHWISE_PLAYWRIGHT_ENTRY=<scratchpad>/pw/node_modules/playwright/index.mjs node scripts/browser-smoke.mjs`. Expected: exit 0.
- [ ] **Step 4: Docs.**
  - **`docs/discovery.md`:**
    - replace "implemented for a single root" with the multi-root behaviour;
    - the workspace file format with an example;
    - IDs and labels;
    - the scan order and shared budgets;
    - the full error-message list from Task 5.
  - **`docs/sessions.md`:** the multi-root identity, and how adding or removing a repository starts a new history (Ruling P1).
  - **`docs/security.md`:**
    - workspace entries may point anywhere the user chooses, but nothing is ever written there;
    - the filesystem root is rejected.
  - **API docs:** `/api/v1/scan` and the view `repository` field.
  - **Roadmap:**
    - mark Phase 3 complete, with exit-gate evidence (test names, CI run, benchmark from PR 1);
    - update the current-state row;
    - mark Phase 4 as next.

  Every line describes delivered behaviour only.
- [ ] **Step 5: Run** `npx --yes pnpm@10.34.9 check`. Expected: green. Then commit with `test,docs: multi-repository end-to-end, browser smoke and Phase 3 exit gate`.
