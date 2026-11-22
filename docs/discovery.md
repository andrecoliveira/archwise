# Automatic discovery and multi-repository workspaces

## Entry points

- `archwise`: analyze the current working directory.
- `archwise --path <directory>`: analyze an explicit root.
- `archwise --repo <directory> --repo <directory>`: compose several repositories into one workspace. `--path` is an alias for one `--repo`, and the two may be mixed.
- `archwise --workspace <file>`: load a reviewed workspace file that lists the repositories and optional labels. It cannot be combined with `--repo` or `--path`.

Every entry point works with `--json`, `--graph`, `--sessions` and `--serve`. Each root is resolved with `realpath` once and must be a readable directory. Duplicate roots, after resolution, are merged silently; the first one keeps its label.

## Safe inventory

The scan runs through `@archwise/discovery`. It lists files without reading them. It reads only `package.json` manifests and `.gitignore` files, both within the byte budgets.

**Ignore precedence,** highest first:

1. Built-in exclusions: `.git`, `.next`, `.turbo`, `node_modules`, `dist`, `build`, `coverage`, `.venv`, `vendor`, `.cache`, `.output`, `target` and `__pycache__`.
2. The repository's `.gitignore` files, root and nested, with Git semantics. A `!` negation can re-include a path a `.gitignore` excluded, but never one a built-in rule excluded. An invalid pattern matches nothing; the file's other rules still apply. `.gitignore` files above the scanned root and `.git/info/exclude` are not read.
3. Everything else is listed.

**Symlinks and special files** are listed but never followed or opened.

**Nested repositories:** a directory containing `.git` (a directory, or a file for worktrees and submodules) is its own repository with a stable `repo-…` ID. Its `.gitignore` rules start fresh. It does not change node IDs or the workspace identity: a project with submodules is still a single-root workspace.

**Budgets** are fixed defaults, totals for the whole scan across all repositories:

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

**Errors** exit with code 2 and a stable message. `<flag>` is the flag that named the root (`--path`, `--repo`, or `--workspace` for an entry of a workspace file), and paths are echoed as typed:

- `Workspace root not found: <path>. Pass an existing directory with <flag>.`
- `Workspace root is not a directory: <path>. Pass a directory with <flag>.`
- `Workspace root is not readable: <path>. Check its permissions.`
- `--repo expects a directory.`, `--path expects a directory.`, `--workspace expects a file.`
- `--workspace cannot be combined with --repo or --path.`
- `Workspace file not found: <file>. Pass an existing file with --workspace.`
- `Workspace file is not readable: <file>. Check its permissions.`
- `Workspace file is too large: <file>. The limit is 1 MiB.`
- `Workspace file is not valid: <file>: <problem>.`, where `<problem>` names the field, for example `repositories[0].path must be a non-empty string`.
- `Workspace entry <n> not found: <path>. Fix repositories[<n>].path in <file>.`
- `Workspace entry <n> is not readable: <path>. Check its permissions.`
- `Workspace entry <n> is not a directory: <path>. Fix repositories[<n>].path in <file>.`
- `Workspace entry <n> is a filesystem root: <path>. Point it at a repository directory.`

`<n>` counts from 0.

## Several repositories

Pass `--repo` more than once, or a workspace file, to see one system across repositories. The Studio shows the packages of every repository in one graph.

**Workspace file** (`archwise.workspace` v1). Archwise reads it and never creates or changes it:

```json
{
  "format": "archwise.workspace",
  "version": 1,
  "repositories": [
    { "path": "../api", "label": "API" },
    { "path": "../web" }
  ]
}
```

- `path` is relative to the file's directory (after resolving the file's own symlinks), or absolute. `..` is allowed, because you review the file; a path that resolves to a filesystem root is rejected.
- `label` is optional. It must be a valid label (1 to 256 characters, no control characters, no home-directory or secret shapes). Without it, the directory name is used.
- Unknown fields are rejected. A file lists 1 to 64 repositories and is at most 1 MiB.
- Before scanning, the CLI prints `Workspace: <label>, <label>…` to stderr.

**Repository IDs and labels:**

- One user root keeps the ID `repo-root`. With several, each user root's ID is `repo-` plus the first 16 hex characters of SHA-256 over its path relative to the roots' common ancestor. Roots with no common ancestor, such as Windows roots on different drives, hash their full path with a lowercased drive letter. IDs never contain the path itself.
- A nested Git repository hashes its path relative to the same common ancestor.
- Equal labels are made unique by prefixing the parent directory name, as in `services/api` and `web/api`, then by a ` #2` suffix if needed. A root that is the home directory is labelled `home`.

**Scan order:** user roots are scanned in the code-unit order of their IDs, and the budgets are shared. If a budget runs out, every later repository is still listed with its label, zero counts and the diagnostic `Repository not scanned: <label>. A budget ran out first.` The revision is then `partial`.

**Overlapping roots:** a root inside another root is skipped there as `nested-repository` and scanned once, as its own repository.

**Paths in output:** with several roots, skip examples and diagnostics start with the root label, as in `web/node_modules`. Manifest paths stay relative to their own root.

**Graph IDs:** with several roots, view node IDs are `package:<root ID>/<path>` and revision node IDs hash `<root ID>/<path>`. Each node carries a `repository` with its ID and label. A single root keeps `package:<path>` and has no `repository` field, even with nested repositories, so existing sessions and Sandbox exports keep working.

**Cross-repository edges:** a declared dependency resolves by exact package name across all repositories. Two packages with the same name produce the `Ambiguous package name` diagnostic, and no edge is drawn.

**Output:** the summary lists each repository with its manifests, entries and skipped paths. `--json` repositories carry `id`, `rootId`, `label`, `path`, `nested`, `reached`, `listedEntries`, `manifests` and `skipped` counts. The Studio header shows a scan summary from `GET /api/v1/scan`: repositories, entries, skipped paths by reason and truncation, counts only.

**Sessions:** a set of repositories is its own project in the store. Adding or removing a repository starts a different session history ([Sessions](sessions.md)).

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
