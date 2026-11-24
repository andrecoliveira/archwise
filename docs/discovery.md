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

**Output:** the summary lists each repository with its manifests, entries and skipped paths. `--json` repositories carry `id`, `rootId`, `label`, `path`, `nested`, `reached`, `listedEntries`, `manifests` and `skipped` counts. The Studio's revision chip reads `GET /api/v1/scan`: when the scan started (`scannedAt`), plus repositories, entries, skipped paths by reason and truncation, as counts only. It shows how long ago the scan ran and whether it is complete or partial, with the reasons. Files that were not analyzed and other diagnostics are listed under **Scan notes** in the left column.

**Sessions:** a set of repositories is its own project in the store. Adding or removing a repository starts a different session history ([Sessions](sessions.md)).

**Performance:** `pnpm bench:inventory` scans generated trees. On an Apple Silicon Mac with Node 26.4:

| Tree | Files | Listed entries | Manifests | Scan |
|---|---|---|---|---|
| small | 1,000 | 1,062 | 10 | 14 ms |
| medium | 20,000 | 20,452 | 200 | 80 ms |
| large | 200,000 | 202,252 | 2,000 | 979 ms |

The large tree exceeds the default entries budget, so the benchmark raises that budget.

## Architecture analyzers

Phase 4 turns the inventory into a system-level graph ([spec](superpowers/specs/2026-11-23-architecture-discovery-design.md)). PR 1 of 3 is implemented: package roles, workspace membership, Docker Compose and Prisma. Source analysis of TypeScript and JavaScript (PR 2) and deployment manifests (PR 3) are not implemented yet.

**Contract.** An analyzer implements `Analyzer` from `@archwise/application`. It is a pure, synchronous function that receives the text of the files it declares, by base name (one `*` wildcard allowed, as in `compose.*.yaml`) or name suffix, plus the repository's parsed `package.json` files. It returns facts, coverage gaps and a `complete` or `partial` status. Analyzers never touch the filesystem or execute anything. A boundary rule forbids Node built-ins in `@archwise/analyzers`. `packages/test-fixtures/src/demo-analyzer.ts` shows that an analyzer can be written outside the core with only the public contract.

**Isolation.** The runner calls each analyzer once per repository, in ID order, with a time budget and a file budget. An analyzer fails for a repository when it throws, returns output that fails the fact schema, or finishes after its deadline. Its findings for that repository are then discarded, its coverage is `failed`, and the Studio shows `Analyzer failed: <id> in <repository>. Its findings were discarded.` Every other analyzer's findings, and every package, are kept.

**Built-in analyzers:**

| Analyzer | Version | Reads | Produces |
|---|---|---|---|
| `node-roles` | 1.1.0 | parsed `package.json` only | package roles and client-library infrastructure |
| `node-workspace` | 1.0.0 | `pnpm-workspace.yaml`; `nx.json`, `project.json`, `lerna.json` as gaps | packages outside the declared workspace |
| `docker-compose` | 1.1.0 | `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml`; `compose.<name>.yaml` and `docker-compose.<name>.yml` variants as gaps | Compose services, images, `depends_on` and the allowlisted properties, with line ranges |
| `prisma-schema` | 1.0.0 | `*.prisma` | the `datasource` provider |

The catalogs of frameworks, client libraries and container images live in `packages/analyzers/src/catalog.ts`. Each external-system entry has a **category**: `payments` (Stripe), `email` (SendGrid, Resend), `storage` (Amazon S3), `monitoring` (Sentry), `ai` (OpenAI, Anthropic) or `other` (Twilio, Firebase, Slack); `auth` is reserved. The category reaches the view graph as the node's optional `category`. The Studio uses it to choose the piece (Stripe is a payments terminal) and for the summary line ("Payments API").

**Roles.** A package depending on a frontend framework (Next, Nuxt, SvelteKit, Remix, Astro, Angular, Vue, Svelte, Solid, React DOM, Expo, React Native) is a frontend. A package depending on a server framework (Express, Fastify, NestJS, Koa, Hono, hapi, Apollo Server, tRPC) is a service. Both kinds of dependency count, development ones included, and frontend wins when both are present. A role from a dependency is `inferred`. A package that a Compose service builds is an `observed` service. Every other package is a library (`module`).

**Client libraries.** A runtime dependency in the catalog, such as `pg`, `ioredis`, `bullmq`, `kafkajs`, `stripe` or `@aws-sdk/client-s3`, adds an `inferred` datastore, queue or external system and a `depends-on` edge from the package. Development dependencies never do, so test-only drivers do not create phantom databases. An ORM without a known engine (`@prisma/client`, TypeORM, Sequelize, Drizzle, Knex) targets "Database (unknown engine)" and the gap `unidentified-datastore`. A Prisma `datasource` provider in the same package names the engine instead.

**Docker Compose.** Compose files are parsed as data with the YAML 1.2 core schema, merge keys, unique keys and at most 100 aliases. A file with any error is the gap `invalid-syntax`. Only `image`, `build`, `ports` and `depends_on` are read. `environment`, `env_file`, `secrets`, `configs`, `labels`, `command` and `entrypoint` are never looked at, and `${…}` interpolation is never resolved. Evidence carries line ranges: a service's own lines, and the lines of its `depends_on`.
- An image in the catalog, such as `postgres`, `redis`, `rabbitmq` or `bitnami/kafka`, becomes an `observed` datastore or queue, named after the Compose service. The registry host, tag and digest are ignored.
- A `build` context that is a package directory links that package to the Compose service. The package keeps its node, and the inspector lists every Compose service that builds it as "Also called".
- A build context matching no package is a service with the gap `unmatched-build-context`.
- Any other image is a service whose technology is the image name.
- `depends_on`, in list or map form, becomes `observed` edges.
- **Properties** ([ADR 0008](decisions/0008-excerpts-and-stored-config-values.md)). The values of `image`, the `build` context, published `ports` (host and container numbers only; interpolated parts are dropped) and `depends_on` attach to the component the service resolves to, each with its line evidence. They are masked (credentials in URLs, values of keys named like passwords, secrets, tokens or keys) and shown under the inspector's **Details**.
- Override and environment variants (`compose.<name>.yaml`, `compose.<name>.yml`, `docker-compose.<name>.yaml` and `docker-compose.<name>.yml`, such as `docker-compose.override.yml` or `compose.prod.yaml`) are the gap `unsupported`: they are listed under "Not analyzed", never merged.

**Merging.** Infrastructure inferred from client libraries attaches to the Compose service of the same technology when the workspace has exactly one. With none, Archwise draws a workspace-wide node such as `datastore:postgresql`. With several, it draws that node, reports `Ambiguous resource: <label> (<candidates>)`, and draws no edge to any of the candidates.

**Workspace membership.** When the repository root declares workspaces (the `package.json` `workspaces` field, or `pnpm-workspace.yaml` `packages`), a `package.json` outside those globs is flagged as outside the workspace. Examples and test fixtures are typical. It stays in the graph and is hidden in the System view. Globs support `*`, `**` and `!` exclusions.

**Identity.** Package nodes keep their Phase 3 IDs. Compose nodes are `compose:<path>#<service>`, prefixed with the root ID when there are several roots. Workspace-wide technology nodes are `datastore:`, `queue:` or `external:` plus the technology. Edges between packages keep `dependency:<source>-><target>`, and every other edge is `<kind>:<source>-><target>`. In the revision, modules keep `mod-` IDs. Frontends, services, datastores, queues and external systems get `fe-`, `svc-`, `ds-`, `q-` and `ext-`.

**Gaps.** Inputs that are recognized but not analyzed appear in the Studio's scan summary under "Not analyzed", and in the revision as `info` diagnostics. A gap alone does not make a revision `partial`. A failed analyzer does, and so does an analyzer that stopped at its file budget (its coverage is `partial`, and the skipped files are `budget` gaps).

| Gap reason | Revision code |
|---|---|
| `unsupported` | `unsupported-input` |
| `invalid-syntax` | `invalid-syntax` |
| `unmatched-build-context` | `unmatched-build-context` |
| `unidentified-datastore` | `unidentified-datastore` |
| `too-large`, `binary`, `unreadable`, `budget` | `input-skipped` |

**Files that are never read.** Whatever an analyzer declares, discovery never reads:
- `.env` and `.env.*`, `*.pem`, `*.key` and `id_rsa*`;
- `.npmrc` and `.netrc`;
- anything under `.ssh/`, `.aws/` or `.gnupg/`.

`package.json` stays parsed by discovery. Analyzer input files obey the same per-file and total byte budgets and the binary check as manifests.

**Output.** `--graph` prints the view graph version 2. Nodes carry `type`, `technology`, `confidence` (`observed` or `inferred`), `reasons`, `outsideWorkspace`, `aliases` and evidence with `lines` and `analyzer`, plus the optional `category` (external systems) and `properties` (Compose values). The graph also has a `gaps` list. Reason codes are `<family>` or `<family>:<parameter>`; the closed list of families is `REASON_CODE_FAMILIES` in `@archwise/application`, and the Studio reads each one as a sentence. `--json` (inventory version 2) is unchanged.

**Studio.** Explore opens on the **System** view, which hides libraries and packages outside the workspace; "Libraries · N hidden" lists them and offers **All packages**, which shows everything. A relation that runs through hidden libraries is an **indirect relation**, for example `api → PostgreSQL` labelled "depends on · through @app/db". It keeps every step with its own level and reasons, takes the weakest step's confidence, and carries the union of the steps' evidence. With several chains it uses the one with the fewest inferred steps, then the shortest, and lists the others under "Also through …". When nothing is recognized, the Studio opens on All packages and says so. Line style carries confidence: solid Observed, dashed Inferred, dotted Unknown. Every claim shows its level and its reasons as sentences.

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

Every node and edge carries evidence: the path, the analyzer, the rule (`kind`) and, when known, the line range. In the revision, evidence is relative to the repository that owns it. Confidence is either `observed` (a file states it, such as a Compose image or a declared workspace dependency) or `inferred` (deduced, such as a database from the `pg` client library), with stable reason codes. Ambiguous evidence draws no edge. User confirmations, a future feature, will be separate attestations and will never rewrite original evidence.
