# Automatic discovery and multi-repository workspaces

## Entry points

- `archwise`: analyze the current working directory.
- `archwise --path <directory>`: analyze an explicit root.
- `archwise --repo <directory> --repo <directory>`: compose multiple roots.
- `archwise --workspace <file>`: load a reviewed workspace manifest with repositories, labels, and optional relations.

Paths are canonicalized once, deduplicated, checked for readability, and assigned stable workspace-relative identifiers. Symlinks are not followed outside declared roots by default.

## Safe inventory (implemented for a single root)

`archwise` and `archwise --path <directory>` scan one root through `@archwise/discovery`. `--repo` and `--workspace` are not implemented yet; they arrive in the next Phase 3 change. The scan lists files without reading them. It reads only `package.json` manifests and `.gitignore` files, both within the byte budgets.

**Ignore precedence,** highest first:

1. Built-in exclusions: `.git`, `.next`, `.turbo`, `node_modules`, `dist`, `build`, `coverage`, `.venv`, `vendor`, `.cache`, `.output`, `target` and `__pycache__`.
2. The repository's `.gitignore` files, root and nested, with Git semantics. A `!` negation can re-include a path a `.gitignore` excluded, but never one a built-in rule excluded. An invalid pattern matches nothing; the file's other rules still apply. `.gitignore` files above the scanned root and `.git/info/exclude` are not read.
3. Everything else is listed.

**Symlinks and special files** are listed but never followed or opened.

**Nested repositories:** a directory containing `.git` (a directory, or a file for worktrees and submodules) is its own repository with a stable `repo-…` ID. Its `.gitignore` rules start fresh. It does not change node IDs or the workspace identity: a project with submodules is still a single-root workspace.

**Budgets** are fixed defaults, totals for the whole scan:

| Budget | Default |
|---|---|
| Listed entries | 200,000 |
| Directory depth | 32 |
| Bytes per read file | 1 MiB |
| Total bytes read | 64 MiB |
| Wall-clock time | 60 s |

When a budget runs out, the scan keeps what it found and marks itself truncated with the budget's name. The depth budget skips only the directories below it, and the scan continues elsewhere. The CLI prints `Scan truncated: <budget> budget reached. Results are partial.` The Studio shows the same line as a diagnostic, and the graph revision is `partial`. A time-truncated scan may differ from run to run. Any other scan of unchanged files gives the same result.

**Every path the scan does not inspect has a reason.** The CLI summary and `--json` report a count per reason, and `--json` adds up to 20 example paths per reason:

| Reason | Meaning |
|---|---|
| `ignored-builtin` | excluded by the built-in list |
| `ignored-gitignore` | excluded by a `.gitignore` rule |
| `symlink` | a symlink inside the root, not followed |
| `outside-root` | a symlink that leaves the root, or a dangling one |
| `nested-repository` | a nested repository, scanned as its own repository |
| `too-deep` | below the depth budget |
| `too-large` | a manifest or `.gitignore` over the per-file byte limit, also reported as a diagnostic |
| `binary` | a manifest with a NUL byte in its first 8 KiB |
| `unreadable` | an entry that could not be read, inspected or parsed |
| `special-file` | a socket, FIFO or device |
| `budget-exhausted` | not reached because a budget ran out |
| `unsupported-name` | a name that cannot be a portable relative path, such as a backslash in a POSIX name |

**Manifests** carry a SHA-256 of their bytes in `--json`. Package and dependency names are redacted ([Security](security.md#redaction-at-the-discovery-boundary)).

**Cancellation:** Ctrl+C during a scan prints `Scan cancelled.` and exits with code 130. No server starts and no scan is recorded.

**Root errors** exit with code 2:

- `Workspace root not found: <path>. Pass an existing directory with --path.`
- `Workspace root is not a directory: <path>. Pass a directory with --path.`
- `Workspace root is not readable: <path>. Check its permissions.`

**Performance:** `pnpm bench:inventory` scans generated trees. On an Apple Silicon Mac with Node 26.4:

| Tree | Files | Listed entries | Manifests | Scan |
|---|---|---|---|---|
| small | 1,000 | 1,062 | 10 | 14 ms |
| medium | 20,000 | 20,452 | 200 | 80 ms |
| large | 200,000 | 202,252 | 2,000 | 979 ms |

The large tree exceeds the default entries budget, so the benchmark raises that budget.

## Repository detection

The resolver searches from each input root for VCS boundaries and ecosystem/workspace manifests, including `package.json`, npm/pnpm/yarn workspaces, Turborepo/Nx configuration, Maven/Gradle, Go workspaces/modules, Cargo, Python project files, Docker Compose, Kubernetes manifests, Terraform, and CI definitions. Support is analyzer-based and incremental; unsupported ecosystems produce coverage diagnostics rather than invented relationships.

Nested repositories are separate roots unless explicitly absorbed. Generated directories, dependencies, build outputs, VCS internals, large binaries, and user ignore rules are excluded. The inventory has configurable file-count, depth, and byte limits with visible truncation diagnostics.

## Static analysis stages

1. **Inventory:** paths, types, sizes, hashes, and manifest candidates.
2. **Manifest parsing:** packages, scripts as text, dependencies, workspace membership, deployment declarations.
3. **Syntax analysis:** imports, exports, endpoints, events, database clients, and framework conventions through safe parsers.
4. **Infrastructure analysis:** containers, services, networks, queues, stores, public entry points, and deployment targets.
5. **Resolution:** map normalized facts across repositories and mark ambiguous or unresolved relations.
6. **Graph build:** aggregate facts into architectural views without discarding underlying evidence.

No stage runs package-manager scripts, imports application modules, starts containers, evaluates templates, or loads repository `.env` files.

## Cross-repository resolution

Relations use declared identifiers first: package coordinates, service names, image names, API schemas, event topics, Terraform outputs, and workspace-manifest hints. Heuristics may correlate endpoints or names only when labeled inferred and assigned lower confidence. Unresolved candidates remain visible so users can confirm or reject them in local metadata.

Repository-specific configuration lives in the Archwise application store by default. A shareable `archwise.workspace.json` may be exported deliberately, but Archwise never creates it inside a repository during inspection.

## Incremental rescans

File hashes and analyzer versions form the cache key. A watcher batches filesystem events, re-runs only affected analyzers, and creates a new graph revision atomically. Git branch changes or large event bursts trigger a consistency rescan. Users can pause watching, request a clean scan, and inspect why an item changed.

## Evidence and confidence

Evidence references contain repository ID, relative path, line/column range when available, analyzer/version, extraction rule, and content hash. Confidence uses explainable categories (`confirmed`, `high`, `medium`, `low`) rather than opaque decimals alone. User confirmations are separate attestations and never rewrite original evidence.
