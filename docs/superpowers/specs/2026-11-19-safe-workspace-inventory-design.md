# Safe workspace inventory: Phase 3

Status: approved by the owner on 2026-11-19. Builder-check questions are resolved below as Claude's calls.

## Intent

The owner wants Archwise to read a project that runs on their machine and show its architecture at system-design level in the Studio: frontend, APIs, databases, queues and external services, connected to each other. The project may span **several repositories**. The project is chosen **in the terminal**, as the docs already describe. The owner first picked a folder browser inside the Studio, then withdrew that choice in favour of the documented CLI flow.

Phase 3 does not detect those system-design pieces; that is Phase 4. Phase 3 makes the scan safe, complete and explainable on real, multi-repository projects, so Phase 4 detectors have a trustworthy file inventory to work from. It should stay lean so Phase 4 starts soon.

Today's inventory, in `apps/cli/src/inventory.ts`, has three limits:
- it walks one root;
- it reads only `package.json` files;
- it stops silently at 3,000 entries.

It also reports skipped paths only partially and has no notion of repositories.

## Goals

1. **Point at one or several repositories from the terminal.**
   - `archwise` scans the current directory.
   - `archwise --path <dir>` keeps working.
   - `archwise --repo <dir> --repo <dir> …` composes several repositories into one workspace.
   - `archwise --workspace <file>` loads a reviewed workspace file.

   Every mode works with `--json`, `--graph`, `--sessions` and `--serve`.
2. **One system across repositories.** The Studio shows the packages of every repository in one graph. Each node shows which repository it belongs to. A declared dependency on a package that lives in another repository becomes an edge.
3. **Safe scanning.**
   - Nothing is executed.
   - There is no network access.
   - Nothing is written inside any root.
   - Symlinks are never followed out of a root.
   - Budgets stop runaway scans with a visible diagnostic.
   - Ctrl+C cancels cleanly.
4. **Explainable coverage.** Every path the scan did not inspect has a reason category. The CLI summary, `--json` and the Studio show the counts per reason and whether the scan was truncated.
5. **Nested repositories.** A Git repository inside a root is a separate repository in the workspace, not part of its parent.
6. **Deterministic results.** The same files with the same analyzer versions produce the same inventory and the same graph revision.
7. **Scan records.** Each scan's metadata is saved in the local store: counts, skip reasons, truncation, duration and analyzer versions.
8. **Inventory moves out of the app.** It moves into a new `packages/discovery`, behind an application port, paying part of the ADR 0005 debt.

## Non-goals

- New architecture detectors (HTTP, databases, queues, Compose, TS imports). These are Phase 4.
- Parsing workspace membership files such as `pnpm-workspace.yaml`, Turborepo or Nx config. Phase 4 manifest parsing covers them.
- Ecosystems other than Node package manifests. The inventory lists all files, but only `package.json` becomes graph data in this phase.
- Choosing a project from the Studio, or any Studio access to the filesystem.
- File watching and incremental rescans (Phase 6).
- Server-Sent Events progress in the browser (Phase 5). The CLI shows progress in the terminal.
- User-tunable budget flags. Defaults are documented and fixed for now.

## Anti-goals

- **Reading file contents that no analyzer needs.** The inventory reads only analyzer inputs. In this phase that means `package.json`.
- **A silent partial scan.** Any truncation is visible in the CLI, `--json` and the Studio.
- **Leaking machine paths.**
  - Absolute roots never reach the graph, the API, `--json`, `--graph` or the browser.
  - Repository labels follow the Phase 2 redaction rules.
- **Breaking existing users.**
  - A single-root scan keeps the same workspace identity, so saved sessions are still found.
  - When the new scan rules find the same manifests as before, the scan also keeps the same view node IDs, the same `projectSignature` (so Sandbox JSON exports still import) and the same revision node IDs.
  - When the new rules change the manifest set (`.gitignore`, new exclusions, larger budgets), the graph legitimately changes. A resumed session then shows the existing "architecture changed" notice. The release notes say so.
- **Writing into an analyzed root**, including caches, lock files or `.archwise` folders.

## Constraints

- AGENTS.md invariants and package boundaries:
  - `packages/discovery` may use Node filesystem APIs.
  - `packages/application` defines the `WorkspaceInventory` port and the scan use case.
  - `apps/cli` composes the pieces.
  - The domain stays pure.
- No new npm dependency without written justification. If the builder adopts a gitignore matcher package, an ADR records why a small in-repo matcher is not enough.
- Supported platforms: Linux, macOS and Windows on Node 24 and 26 (the CI matrix). Paths in all outputs are repository-relative and `/`-separated.
- Store schema changes go through the existing migration mechanism, with a backup before migrating.

## Decisions taken in this design

All of these are Claude's calls; the owner can override any of them.

### Command line

- **Roots:**
  - `--repo` may repeat.
  - `--path <dir>` is an alias for a single `--repo`.
  - With no root flag, the current directory is the single root.
  - `--workspace` cannot be combined with `--repo` or `--path`.
- **Validation:**
  - Each root is resolved with `realpath` once and must be a readable directory.
  - Duplicate roots, after resolution, are merged silently.
- **Overlapping roots:** if one root is inside another, the inner one becomes its own repository and is excluded from the outer one. This is the same treatment as a nested Git repository.
- **Errors** exit with code 2 and print a stable, documented message naming the problem and the flag. A missing root, an unreadable root, a file given instead of a directory and an invalid workspace file are each a distinct message.
- **Workspace-file paths:**
  - Relative entries resolve against the file's directory, and `..` is allowed. The file is reviewed by the user, and absolute paths are allowed anyway.
  - An entry that resolves to the filesystem root is rejected.
  - Each entry must be a readable directory.
  - The summary prints each resolved repository label before scanning.
  - Safety does not depend on where roots point. The scan never reads outside its roots and never writes anywhere in them.
- **`--workspace <file>`** is reviewed JSON, `{ "format": "archwise.workspace", "version": 1, "repositories": [{ "path": "…", "label": "…" }] }`.
  - Paths are relative to the file's directory. Absolute paths are also accepted.
  - `label` is optional and follows the domain label rules.
  - Unknown fields are rejected.
  - Archwise never creates or modifies this file.
- **The human-readable default output** lists each repository with these counts:
  - manifests found;
  - files listed;
  - paths skipped, grouped by reason;
  - a truncation warning, when the scan was truncated.
- **`--json`** emits the portable inventory:
  - repositories, with ID, label and counts;
  - manifests;
  - skip counts by reason;
  - truncation;
  - diagnostics.

  It contains no absolute paths.

### Repositories and identity

- **Repository ID:**
  - The single user root keeps today's `repo-root`.
  - Every other repository, whether a user root in a multi-root workspace or a nested repository, gets `repo-` plus the first 16 hex characters of SHA-256 over its path relative to the workspace's common ancestor, using `/` separators.
  - IDs are deterministic, contain no `/`, and never contain the path itself.
- **Repository label:**
  - It is the workspace-file label, or the redacted directory name.
  - Duplicates are made unique by prefixing the parent directory name, for example `services/api` and `web/api`.
  - When the root is the user's home directory itself, the label is `home`, not the username.
- **User roots and nested repositories:**
  - A *user root* is a root given on the command line or in the workspace file.
  - A *nested repository* is found below a user root.
  - Nested repositories get their own repository ID, label and evidence grouping, but they do not change node IDs or workspace identity. Both derive from user roots only.
  - So a single-root project with submodules is still a single-root workspace.
- **Workspace identity:** the sorted set of canonical user-root paths.
  - A single root keeps today's identity, the root path itself, so existing sessions are still found.
  - A multi-root workspace is a new identity. Adding or removing a repository therefore starts a different session history. The docs say so.
  - The builder chooses the storage representation inside a migration.

### Graph across repositories

- **Single-root view node IDs** stay `package:<manifest path relative to the user root>`. This holds even for manifests inside nested repositories.
- **Multi-root view node IDs** become `package:<user-root repository ID>/<manifest path relative to that user root>`.
  - They are keyed by ID, not label, so renaming a label never changes IDs, and the separator is unambiguous.
  - Evidence keeps the repository-relative path plus the repository ID.
- **Revision node IDs:**
  - In a single-root workspace they keep today's formula, `mod-` plus a hash of the relative path, so an unchanged project reuses its revision.
  - In a multi-root workspace they hash the user-root repository ID plus the relative path.
- **Cross-repository edges:**
  - A declared dependency resolves to a workspace package by exact package name, across all repositories.
  - If more than one package has that name, the existing "ambiguous package name" diagnostic applies, and no edge is drawn.
  - Edges keep `observed` confidence because both ends are declared.
- **Studio:**
  - Each node shows its repository label.
  - The inspector shows the repository and relative path.
  - A compact scan summary is reachable from the header: repositories, files, skipped by reason and truncation.

  No other UI changes.

### Inventory behaviour

- **Listing versus reading:**
  - The walk lists every non-ignored file with its path, size and extension.
  - It reads a file only when an analyzer needs it. In this phase that means `package.json`.
  - A file that is read is checked against its size limit, sniffed for binary content (a NUL byte in the first 8 KiB) and hashed with SHA-256. The hash goes into evidence.
- **Ignore precedence, highest first:**
  1. Built-in exclusions: VCS internals, `node_modules`, build and cache outputs. The current list is kept, plus `.cache`, `.output`, `target` and `__pycache__`.
  2. The repository's `.gitignore` files, root and nested, with Git semantics. Negation (`!`) can re-include a path that a `.gitignore` excludes, but never one that a built-in rule excludes.
  3. Everything else is included.
- **Symlinks:**
  - A symlink is listed and reported with reason `symlink`. It is never followed.
  - A symlink that would leave the root is reported as `outside-root`.
  - Cycles are impossible because links are not followed.
- **Nested repositories:** a directory containing `.git` (a directory or a file, which covers worktrees and submodules) below a root becomes a separate repository. It is reported once as `nested-repository` in the parent repository's skip counts, then scanned as its own repository.
- **Special files:** sockets, FIFOs and devices are reported as `special-file` and never opened.
- **Budgets** are workspace totals, documented in `docs/discovery.md`:

  | Budget | Default |
  |---|---|
  | Listed entries | 200,000 |
  | Directory depth | 32 |
  | Bytes per read file | 1 MiB |
  | Total bytes read | 64 MiB |
  | Wall-clock time | 60 s |

  - When a budget is exhausted, the scan stops listing.
  - It keeps what it has, marks itself `truncated` with the budget that was hit, and the revision's coverage becomes `partial`.
  - Budgets are shared across repositories, which are scanned in the code-unit order of their IDs.
  - A repository not reached before the budget ran out still appears, with its label, coverage `partial`, zero counts and the diagnostic `budget-exhausted`. It never disappears silently.
  - The determinism goal applies to scans that hit no time budget. A time-truncated scan is marked as such and is not guaranteed to be identical on the next run.
- **Skip reason categories,** a closed set:

  | Category | Meaning |
  |---|---|
  | `ignored-builtin` | excluded by the built-in list |
  | `ignored-gitignore` | excluded by a `.gitignore` rule |
  | `symlink` | a symlink inside the root, not followed |
  | `outside-root` | a symlink that would leave the root |
  | `nested-repository` | a nested repository, scanned separately |
  | `too-deep` | below the depth budget |
  | `too-large` | over the per-file byte limit |
  | `binary` | binary content where text was expected |
  | `unreadable` | could not be read |
  | `special-file` | a socket, FIFO or device |
  | `budget-exhausted` | not reached because a budget ran out |

  Counts are reported per category. Up to 20 example relative paths per category are kept for display, chosen deterministically as the first by code-unit order.
- **Cancellation:**
  - The inventory takes an `AbortSignal`.
  - Ctrl+C during a scan exits with code 130 and leaves nothing behind.
  - A scan cancelled during `--serve` startup does not start the server.
- **Determinism:**
  - Entries are sorted by code-unit order, never by locale.
  - Results do not depend on directory read order.
  - Unicode file names are preserved as-is; only NFC is compared for duplicate detection on macOS.
- **Progress:** when stderr is a TTY, a single updating line shows the repository, entries listed and elapsed time. Nothing is printed when stderr is not a TTY.

### Store

- **Scans are recorded only when the store is in use** (`--serve` without `--no-store`, and `--sessions`). The default output, `--json` and `--graph` never open the store. The `scanWorkspace` use case therefore takes an optional scan repository.
- **A new `scans` table** records one row per completed or truncated scan. Its fields are the workspace, the revision produced, start and finish times, counts per skip category, truncation (with the budget name) and analyzer versions. Its contents are counts and codes only, never paths.
- **`--sessions` output** gains the date of the last scan.

## Interfaces the builder must honor

- **`packages/application`:**
  - the `WorkspaceInventory` port: `inspect(roots, options, signal) → InventoryResult`;
  - `ScanRepository`: `record(scan)` and `latest(workspaceId)`;
  - a `scanWorkspace` use case that runs the inventory, builds the revision and records the scan. Its contract tests run against the in-memory and SQLite adapters.
- **`packages/discovery`:** the filesystem implementation of `WorkspaceInventory`, and the manifest reader moved from `apps/cli`. Boundary rules forbid it from importing apps.
- **`InventoryResult`:**
  - repositories: ID, label, canonical root (kept in the process, never serialized to outputs), counts;
  - listed files;
  - manifests, with content hash;
  - skip counts and examples per category;
  - truncation;
  - diagnostics.
- **The existing outputs** (`/api/v1/graph`, `--graph`, sessions API) keep their shapes. The view graph gains an optional `repository` field per node, and the API gains a scan-summary field. Both are additive.

## Acceptance

- Fixture tests cover:
  - unreadable roots;
  - nested repositories, including a `.git` file;
  - a symlink cycle and an escaping symlink;
  - a path traversal attempt through the workspace file;
  - huge and binary manifests;
  - Unicode and Windows-style paths;
  - cancellation;
  - `.gitignore` precedence and negation;
  - every budget.

  Each skipped fixture path appears under the expected reason category.
- Two repositories, where one depends on a package from the other, produce one graph with a cross-repository edge. Both repository labels are visible in the Studio (browser smoke).
- An unchanged single-root project scanned before and after this phase has the same view node IDs, `projectSignature` and workspace identity. A saved session from before the upgrade resumes.
- The end-to-end test proves every fixture root is byte-identical after the scan, including the modification times of its files.
- A benchmark script generates small (1k), medium (20k) and large (200k entries) synthetic trees and reports scan time. It is not a CI gate. Its results are recorded in the PR and in `docs/discovery.md`.
- `--json`, `--graph` and API responses contain no absolute paths, for multi-root workspaces as well.
- CLI error messages for each root and workspace-file failure are covered by tests and listed in the docs.
- `pnpm check`, the CI matrix, CodeQL and the browser smoke pass. These docs describe the delivered behaviour:
  - `docs/discovery.md`;
  - `docs/alpha-testing.md`;
  - CLI help;
  - the roadmap's Phase 3 status;
  - an ADR, if a dependency is added.

## Left to the builder

- The module split inside `packages/discovery`.
- The workspace-identity storage representation, provided it stays inside a migration.
- The exact CLI summary layout and progress-line format.
- Whether the gitignore matcher is in-repo or a justified dependency.
- The Studio scan-summary placement and design, kept consistent with the existing header.

## Delivery

Two PRs:

1. **Safe inventory:**
   - `packages/discovery` and the port;
   - ignore rules, symlinks, nested repositories, budgets, reasons, hashing and cancellation;
   - the new CLI summary and `--json`;
   - the `scans` table;
   - a single root only, behaviour-compatible.
2. **Multiple repositories:**
   - `--repo`, `--workspace` and workspace identity;
   - cross-repository edges;
   - repository labels and the scan summary in the Studio;
   - browser smoke;
   - docs, and the Phase 3 exit gate.
