# Useful architecture discovery: Phase 4

Status: draft for owner review. The owner asked Claude to write the spec directly, without a question round. Every decision below is Claude's call unless it says otherwise. A builder check raised four identity and compatibility questions. They are answered below and marked "(builder check)".

## Intent

The owner wants the Studio to show a project's architecture at system-design level: frontends, APIs, databases, queues and external services, connected to each other, across one or several repositories. Today Archwise shows only workspace packages and their declared dependencies.

Phase 3 made the scan safe, multi-repository and explainable. Phase 4 turns that file inventory into an evidence-backed architecture graph. Every visible item must come with the evidence that produced it. Anything Archwise cannot recognize must appear as a coverage gap, never as a guess presented as fact.

Phase 4 is large, so it ships in three pull requests. Each one leaves the product working and more useful:

| PR | Delivers | What the user sees |
|---|---|---|
| 1 | Analyzer contract, workspace membership, package roles, client-library detection, Docker Compose, Prisma schema | A **System** view: frontends, services, databases, queues and external services, with evidence and confidence |
| 2 | Source analysis of TypeScript and JavaScript | Real call edges: frontend → API, service → service by HTTP, producers and consumers of queue topics, scheduled jobs, routes in the inspector |
| 3 | Deployment manifests, precision review on open-source fixtures, exit gate | Deployment units, a measured precision report, Phase 4 closed |

PR 1 is specified in detail. PRs 2 and 3 are specified at the level needed to keep PR 1's contracts right. Each gets its own plan, and if one needs a decision this spec does not settle, it comes back to the owner before its plan.

## Goals

1. **System view by default.** Opening a supported project shows its deployable parts and the infrastructure they use, not a list of every package.
2. **Evidence for every visible item.** Each node and edge lists the files, and from PR 2 the lines, that support it, plus the analyzer and rule that produced it.
3. **Honest confidence.**
   - `observed`: a file states it directly, such as a Compose service image or a declared dependency between two workspace packages.
   - `inferred`: Archwise deduces it, such as "this package uses PostgreSQL because it depends on `pg`".

   The Studio shows the difference.
4. **Ambiguity is preserved.** When evidence fits more than one target, Archwise draws no edge and reports a diagnostic naming the candidates.
5. **Coverage gaps are visible.** Recognized-but-unsupported inputs, such as an Nx `project.json`, a Compose override file or a Kubernetes manifest before PR 3, are listed in the Studio as "not analyzed", with a reason.
6. **Isolation.** One analyzer failing, timing out or emitting invalid output does not discard other analyzers' evidence. Its coverage becomes `failed` and a diagnostic says so.
7. **Extensible contract.** An analyzer can be written outside the core packages. It imports only the published contract types, not app internals.
8. **Deterministic.** The same files and the same analyzer versions produce the same graph, byte for byte, with stable ordering.

## Non-goals

- **Languages other than JavaScript and TypeScript** for source analysis. Other ecosystems' manifests are not read. They appear in coverage only if a later phase adds them.
- **Executing anything,** including package scripts, Compose interpolation, `next.config.js` or Prisma generators.
- **Resolving runtime configuration values.** Environment variable *names* are evidence from PR 2 on. Their *values* are never read. `.env` files stay unread.
- **Loading third-party analyzers at runtime.** Phase 4 defines the contract and proves it can be implemented outside the core. A plugin loader with consent and sandboxing is a later decision with its own ADR.
- **A hard, pre-emptive analyzer timeout** through worker threads. Phase 4 analyzers are cooperative and checked by contract tests; see "Analyzer contract".
- **Simulation semantics for discovered nodes.** The Sandbox can still be created from the discovered graph. Discovered datastores and queues do not get simulator defaults in this phase.
- **Editing or writing analyzed files.**

## Anti-goals

- **A noisy graph.** A user opening a 40-package monorepo must not see 40 boxes by default. Libraries are folded into the services that use them; see "Studio".
- **Guessing presented as fact.** A dependency on `pg` never becomes an `observed` database.
- **Reading secrets.** No analyzer receives `.env*`, private keys, credential directories or other files on the security deny list. Compose `environment` values and Prisma `url` values are never stored, logged or shown. Only the shape "set from an environment variable named X" can appear, and only from PR 2.
- **Breaking existing users.**
  - Package node IDs stay `package:<path>` (single root) and `package:<rootId>/<path>` (several roots).
  - Revision IDs for modules keep their formula.
  - Edges between workspace packages keep the `dependency:` ID prefix, so their view and revision IDs do not change (builder check).
  - New nodes, new edges and new evidence on an existing node legitimately change the graph. That includes a `compose.yaml` or `schema.prisma` attached to a package. A resumed session therefore shows the existing "architecture changed" notice, and older Sandbox exports of such a project stop matching its signature. The release notes say so. A project where no analyzer finds anything new keeps the same signature.
- **A silent analyzer failure.** Every analyzer that ran has a coverage row per repository.

## Constraints

- AGENTS.md invariants and boundaries. Analyzers never touch the filesystem. Discovery reads the files they declare, within the Phase 3 budgets, and hands them the bytes.
- **New runtime dependencies,** each pinned to an exact version and recorded in an ADR (ADR 0007) with why the standard library or an existing dependency is not enough:
  - `yaml` (PR 1) parses Compose and `pnpm-workspace.yaml`. It has no dependencies, uses the YAML 1.2 core schema and does not execute custom tags. Hand-written YAML parsing is a known source of security bugs.
  - `typescript` (PR 2) parses TypeScript and JavaScript syntax. It is already in the toolchain as a dev dependency, is pure JavaScript with no native binaries, so it installs on every CI platform, and parses TS, TSX, JS and JSX exactly. Only the parser API (`createSourceFile`) is used. No program, type checker or config loading.
- Supported platforms remain Linux, macOS and Windows on Node 24 and 26.
- **`archwise.graph` stays version 1.** The node kind `frontend` is added to the domain vocabulary. That is additive: every existing export still imports. A revision containing a `frontend` node does not import into an older Archwise, which is acceptable before 1.0 and is noted in the release notes.

## Decisions

### Analyzer contract (PR 1)

The contract lives in `packages/application/src/analyzer.ts` and is exported from `@archwise/application`. It has no Node imports. Built-in analyzers live in a new package `packages/analyzers`, which depends only on `@archwise/application`, `@archwise/domain` and its declared parser dependencies. Boundary rules forbid it from importing `packages/discovery`, `packages/storage` or any app.

```ts
interface AnalyzerDescriptor {
  readonly id: string;              // kebab-case, unique, e.g. 'docker-compose'
  readonly version: string;         // semver; part of evidence and coverage
  readonly inputs: {
    readonly fileNames: readonly string[];   // exact base names, e.g. 'compose.yaml'
    readonly extensions: readonly string[];  // e.g. '.prisma'; PR 2 adds '.ts', '.tsx', ...
  };
  readonly budget: { readonly timeMs: number; readonly maxFiles: number };
}

interface AnalyzerInput {
  readonly repository: { readonly id: string; readonly label: string };
  readonly files: readonly { readonly path: string; readonly text: string }[]; // repository-relative, '/'-separated, sorted
  readonly packages: readonly PackageFact[];   // the repository's parsed manifests
  readonly deadline: number;                   // epoch ms; check with shouldStop()
  readonly signal: AbortSignal;
}

interface Analyzer {
  readonly descriptor: AnalyzerDescriptor;
  analyze(input: AnalyzerInput): AnalyzerOutput;   // synchronous and pure
}

interface AnalyzerOutput {
  readonly status: 'complete' | 'partial';
  readonly facts: readonly Fact[];
  readonly gaps: readonly CoverageGap[];          // { path, reason: 'unsupported' | 'invalid-syntax' | 'too-large' | 'budget' }
}
```

- **Facts** are a closed, versioned union:
  - `component`: a package or Compose service with a role;
  - `resource`: a datastore, queue, external system or job, with a technology;
  - `relation`: an edge between two references;
  - `env-reference`: a variable name, from PR 2.

  Every fact carries one or more evidence items `{ path, lines | null, ruleId }`.
- **The runner** lives in `packages/application`. It calls each analyzer once per repository, in analyzer-ID order, and validates every output against the fact schema.
  - An exception, an output that fails validation, or a return after the deadline marks that analyzer's coverage as `failed` for that repository and adds the diagnostic `analyzer-failed`.
  - The analyzer's facts are discarded. Everything else is kept.
  - A `partial` status marks coverage `partial`.
  - An abort from Ctrl+C stops the whole run, as in Phase 3.
- **Package manifests stay in discovery** (builder check).
  - Discovery keeps parsing `package.json` into `InventoryManifest`, as in Phase 3.
  - Package nodes and the edges between workspace packages are built from that inventory, not from analyzer facts.
  - `PackageFact` is the analyzer-facing projection of `InventoryManifest`: name, path, `dependencies`, `devDependencies` and `workspaces`.
  - If an analyzer fails, packages therefore still appear, as `module`. "Analyzer failed" can never mean "no graph".
- **Discovery reads analyzer inputs.**
  - It reads every listed file whose base name or extension some analyzer declares, under the existing per-file and total byte budgets and the binary check.
  - Files on the security deny list are never read, whatever the declarations: `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, and anything under `.ssh/`, `.aws/` or `.gnupg/`.
  - Text is decoded as UTF-8.
  - A file that is too large or binary becomes a gap for the analyzers that wanted it.
- **The resolver** (`resolveArchitecture`, in `packages/application`) merges facts from all analyzers and repositories into the view graph and the `archwise.graph` revision. All identity and ambiguity rules below live there, so analyzers stay small.

### Built-in analyzers in PR 1

| Analyzer | Inputs | Emits |
|---|---|---|
| `node-roles` 1.0.0 | none (reads `packages`) | package roles and client-library resources |
| `node-workspace` 1.0.0 | `pnpm-workspace.yaml` (plus `workspaces` from `packages`) | workspace membership; gaps for `nx.json`, `project.json`, `lerna.json` (`unsupported`) |
| `docker-compose` 1.0.0 | `compose.yaml`, `compose.yml`, `docker-compose.yaml`, `docker-compose.yml` | Compose services as components or resources, `depends_on` relations, build-context links to packages; gaps for override files such as `docker-compose.override.yml` and `compose.*.yaml` |
| `prisma-schema` 1.0.0 | `.prisma` | the datasource provider as a datastore technology for the owning package |

**Workspace membership.** When a repository root declares workspaces (the `package.json` `workspaces` field, array or `{ packages }`, or `pnpm-workspace.yaml` `packages`), a `package.json` outside those globs is an *outside-workspace* package. Examples are test fixtures and examples. Such packages stay in the graph, flagged, and are hidden in the System view. Glob matching supports `*`, `**` and leading `!` exclusions. Without workspace declarations, every package is a member, as today.

**Package roles,** from declared `dependencies` and `devDependencies`:

| Role | Rule (first match wins) |
|---|---|
| `frontend` | `next`, `nuxt`, `@sveltejs/kit`, `@remix-run/react`, `astro`, `@angular/core`, `vue`, `svelte`, `solid-js`, `react-dom`, `expo`, `react-native` |
| `service` | `express`, `fastify`, `@nestjs/core`, `koa`, `hono`, `@hapi/hapi`, `@apollo/server`, `@trpc/server`; or the package is a Compose build target |
| `module` | anything else |

- A role from dependencies is `inferred`. A role from a Compose build target is `observed`.
- A package with both frontend and service signals, such as Next.js with API routes, is a `frontend`. The inspector lists both signals.
- `technology` is the first matching dependency name. It replaces today's `framework` field and keeps the same values where they overlap.

**Client libraries → resources.** A curated, versioned catalog in `node-roles` maps dependency names to a resource kind and technology:

| Kind | Examples (the catalog file is authoritative) |
|---|---|
| datastore | `pg`, `postgres`, `mysql2`, `mongodb`, `mongoose`, `redis`, `ioredis`, `better-sqlite3`, `@elastic/elasticsearch`, `@aws-sdk/client-dynamodb` |
| datastore via ORM | `@prisma/client` (technology from `schema.prisma`, else "unknown SQL"), `typeorm`, `sequelize`, `drizzle-orm`, `knex` |
| queue | `bullmq`, `bull`, `amqplib`, `kafkajs`, `@aws-sdk/client-sqs`, `@google-cloud/pubsub`, `nats` |
| external system | `stripe`, `@sendgrid/mail`, `resend`, `twilio`, `@aws-sdk/client-s3`, `firebase-admin`, `@sentry/node`, `openai`, `@anthropic-ai/sdk`, `@slack/web-api` |

- Each match emits an `inferred` resource and a `depends-on` relation from the package. The reason is `client-library:<dependency>`.
- Only `dependencies` count for resources. `devDependencies` are ignored here, because test-only database drivers would otherwise create phantom databases.
- ORM entries whose underlying store cannot be identified create a datastore labelled "Database (unknown engine)". They also emit the gap `unidentified-datastore`.

**Docker Compose.**
- Parsed as data with the `yaml` core schema. The safety limits are: maximum 100 aliases; duplicate keys are an error; `${…}` interpolation is never resolved and stays literal text.
- **A service with an `image`** whose repository name (the part before `:` or `@`, without a registry host) is in the image catalog becomes an `observed` resource of that kind and technology. Examples: `postgres`, `mysql`, `mariadb`, `mongo`, `redis`, `valkey`, `rabbitmq`, `confluentinc/cp-kafka`, `bitnami/kafka`, `nats`, `elasticsearch`, `minio/minio`.
- **A service with a `build`** context matching a package directory, such as `./apps/api`, is *linked* to that package (builder check):
  - The package node keeps its `package:` ID. No `compose:` node is created for it.
  - Its role becomes `observed` `service`, or stays `frontend` if the dependency rule says frontend.
  - Several Compose services that build the same package, such as `api` and `worker` from one image, all link to that one node. The inspector lists every Compose service name.
  - `depends_on` from or to a linked service attaches to the package node. Self-edges are dropped.
  - A context matching no package becomes an `observed` service `compose:…#<service>`, with gap `unmatched-build-context`.
- **Any other service** becomes an `observed` service whose technology is its image name.
- **`depends_on`** (list or map form) becomes `observed` `depends-on` relations.
- **`environment`, `env_file`, `secrets`, `command` and `entrypoint` are not read** into facts. The parser receives them, and the analyzer drops them before emitting anything.

**Prisma.** The analyzer finds the `datasource` block and reads only its `provider` string literal: `postgresql`, `mysql`, `sqlite`, `sqlserver`, `mongodb` or `cockroachdb`. The `url` line is never stored. The result attaches the datastore technology to the package that owns the schema file, which is the nearest enclosing `package.json`.

### Identity and merging (resolver)

- Package nodes keep their Phase 3 IDs. Their `type` changes from `package` to the role.
- **Resource node IDs** are deterministic and path-free:
  - **Compose services:** `compose:<rootPrefix><composePath>#<service>`. `<rootPrefix>` is `<rootId>/` only in multi-root workspaces.
  - **Technology resources** inferred from libraries: `datastore:<technology>`, `queue:<technology>` and `external:<technology>`, one per workspace.
- **Merging library evidence with Compose:**
  - When the workspace has exactly one Compose resource of a technology, client-library relations for that technology attach to it. No separate technology node is created.
  - When it has none, the technology node is created as `inferred`.
  - When it has more than one, the technology node is created as `inferred` and the diagnostic `ambiguous-resource` names the Compose candidates. No edge goes to any one of them.
- **Edge IDs:** edges between workspace packages keep `dependency:<sourceId>-><targetId>`. Every other edge is `<kind>:<sourceId>-><targetId>`. Several evidence items for the same edge merge into one edge carrying all of them.
- **The revision** maps roles and resources to domain kinds:
  - `frontend` → `frontend` (new);
  - `service` → `service`;
  - `module` → `module`;
  - datastore → `datastore`;
  - queue → `queue`;
  - external → `external-system`.

  Revision IDs for new nodes follow the existing `prefix-shortHash(key)` pattern, with prefixes `fe-`, `svc-`, `ds-`, `q-` and `ext-`. Module nodes keep `mod-`, so unchanged modules keep their revision IDs. Coverage gets one row per analyzer per repository.
- **Revision status** (builder check). Gaps are `info` diagnostics and do not make a revision `partial`. `partial` still means what it means today: truncation, an unreached repository, or a warning, such as an ambiguity or an unresolved dependency. A failed analyzer also makes it `partial`. The `system-fixture` is designed to be `complete`.
- **Diagnostic codes** added: `analyzer-failed`, `ambiguous-resource`, `unmatched-build-context`, `unidentified-datastore`, `unsupported-input` and `invalid-syntax`. Gaps appear as diagnostics with severity `info` and an `evidence` reference.

### View graph v2 (`/api/v1/graph` and `--graph`)

The CLI's view graph goes from version 1 to version 2. It is a documented CLI contract change.

```ts
node: { id, type: 'frontend'|'service'|'module'|'datastore'|'queue'|'external-system'|'job',
        label, technology: string|null, confidence: 'observed'|'inferred', reasons: string[],
        outsideWorkspace: boolean, origin: 'discovered',
        evidence: { path, kind, lines: {start,end}|null, analyzer: string }[],
        repository?: { id, label } }
edge: { id, type: 'depends-on'|'calls'|'publishes'|'consumes'|'reads'|'writes',
        source, target, confidence, reasons, origin: 'discovered', evidence: [...] }
graph: { version: 2, nodes, edges, diagnostics: string[], gaps: { path, analyzer, reason }[], inspectedEntries }
```

- The Studio's validator accepts version 2. Version 1 graphs, which sessions saved before Phase 4 still hold, are converted on read by a pure `upgradeGraph` function (builder check). It maps:
  - `package` → `module`;
  - `framework` → `technology`;
  - `declared-dependency` → `depends-on`;
  - confidence → `observed`;
  - lines → `null`;
  - gaps → empty;
  - every ID unchanged.

  Old sessions therefore keep their historical view and still show the "architecture changed" notice when the new graph differs.
- The Sandbox `projectSignature` keeps its formula. It still hashes node IDs and evidence paths.

### Studio (PR 1)

- **Two views,** switched from the header. Default: **System**.
  - **System** shows frontends, services, datastores, queues, external systems and jobs, and hides modules and outside-workspace packages. A hidden module's resource and service edges are *lifted* to every visible package that depends on it, directly or transitively. Example: `api → @app/db → PostgreSQL` is shown as `api → PostgreSQL`, marked `inferred` with the reason "via @app/db".
    - Lifting is a pure, tested function in `apps/web`.
    - A visible package with no edges stays visible.
    - If the System view would be empty, because no roles or resources were found, the Studio opens on **All packages** and says why.
  - **All packages** shows everything, as today, plus resources.
- **Nodes:**
  - Each kind has its own symbol and kind label.
  - `inferred` items have a dashed outline and the word "inferred" in their subtitle.
  - The technology shows under the name.
- **Inspector:**
  - kind, technology and confidence with reasons;
  - evidence as `path` or `path:line`, with analyzer and rule;
  - repository, as in Phase 3.
- **Coverage:** the scan summary panel gains a "Not analyzed" list of gaps grouped by reason, and one line per failed analyzer.
- The Sandbox works from either view as today. Proposals stay in the overlay.

### Source analysis (PR 2, outline)

- **`ts-source` analyzer:** inputs `.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`.
  - Parsed with `typescript.createSourceFile` only. Excluded: `.d.ts` files, files over the per-file budget, and test files (`*.test.*`, `*.spec.*`, `__tests__/`, which are reported as skipped by rule).
  - Every source fact carries line ranges.
- **Detections, all syntactic with literal arguments only:**
  - **Imports and re-exports** between workspace packages become `depends-on` with reason `import`. They are `observed`, because the file says it.
  - **HTTP routes:** Express, Fastify and Koa router method calls with literal paths, NestJS controller and method decorators, and Next.js `app/**/route.ts` and `pages/api/**` files. Each becomes an `api` element listed under its service. Routes appear in the inspector, not as nodes.
  - **HTTP clients:** `fetch`, `axios` and `ky` calls whose URL is a string literal or template literal with a literal prefix, or built from `process.env.NAME`.
  - **Queue topics:** BullMQ `new Queue('x')` and `new Worker('x')`, KafkaJS `send({ topic })` and `subscribe({ topic })`, and amqplib `sendToQueue` and `consume` with literal names. They become `topic` resources with `publishes` and `consumes` edges.
  - **Scheduled jobs:** `node-cron` `schedule('…')` and NestJS `@Cron`. They become `job` nodes under their service.
  - **Environment variable names:** `process.env.NAME` and `import.meta.env.NAME`, as names only.
- **Cross-service resolution:**
  - A client call resolves to a service when its literal path matches exactly one route of exactly one other service, after normalizing parameters (`:id`, `[id]` and `{id}` all equal).
  - It also resolves when its environment-variable host name matches a Compose service of that name through `depends_on` or the variable naming convention `<SERVICE>_URL`.
  - The result is a `calls` edge, `inferred`, with both the call site and the route as evidence.
  - Several matches → diagnostic `ambiguous-call`, no edge. No match → listed as an unresolved outbound call in the inspector.
- Dynamic URLs, computed topic names and unsupported frameworks become gaps, never guesses.

### Deployment and closing (PR 3, outline)

- **`dockerfile` analyzer:** reads `FROM` and `EXPOSE` as data. It never evaluates `ARG` substitution and never runs anything. It links a Dockerfile to its package as a deployment unit.
- **`kubernetes-manifest` analyzer:** reads `Deployment`, `StatefulSet`, `Service` and `CronJob` YAML documents with a literal `image`, as data. Helm templates and Kustomize overlays are gaps (`unsupported`).
- **Precision review:** three to five open-source fixtures under compatible licenses, vendored as trimmed copies or generated in `packages/test-fixtures`. For each one, a hand-checked expected graph and a report of true, false and missed items, committed to `docs/`. Any false positive above 0 in `observed` items blocks the exit gate. `inferred` precision is reported, not gated.
- Phase 4 exit-gate evidence table in the roadmap, as for Phase 3.

## Tests

- **One synthetic fixture per analyzer behaviour and per threat case,** such as a YAML alias bomb, a duplicate key, Compose interpolation, a deny-listed file name, a huge single-line file, invalid syntax and a binary file with a matching name.
- **Golden snapshots:** the view graph and revision for a documented fixture (`system-fixture`) are checked in, with normalized paths and stable ordering. The fixture is a pnpm monorepo with:
  - `apps/web` (Next);
  - `apps/api` (Fastify, using `packages/db` and `stripe`);
  - `apps/worker` (BullMQ);
  - `packages/db` (`pg` plus `schema.prisma` with `postgresql`);
  - `compose.yaml` (postgres, redis, api and worker builds);
  - a stray `examples/demo/package.json` outside the workspace.
- **Analyzer contract tests,** run against every built-in analyzer and a test-only analyzer:
  - an exception, a timeout past the deadline, an invalid fact, partial output and a version change (coverage rows and evidence carry the new version);
  - a demonstration analyzer under `packages/test-fixtures` that imports only `@archwise/application`, proving the "outside the core" exit criterion. Boundary rules check it.
- **Determinism:** two runs over the fixture are byte-identical, and input order does not matter.
- **Studio:** unit tests for lifting, view switching and the v2 validator; the browser smoke opens `system-fixture` and checks that the System view shows the expected kinds.
- **Compatibility:**
  - `upgradeGraph` turns a stored Phase 3 view into a valid v2 graph with the same node and edge IDs;
  - a Phase 3 project with no detectable resources keeps its package node IDs and module revision IDs;
  - a resumed session of a project that gains nodes shows the "architecture changed" notice.

## Documentation

Each PR updates the documentation it touches:
- `docs/discovery.md`: analyzers, catalogs, identity rules, gaps and the deny list;
- `docs/security.md`: which files analyzers can read and what is never stored;
- `docs/sessions.md`: compatibility notes;
- `docs/architecture.md` and package READMEs;
- `docs/implementation-roadmap.md`: progress and, in PR 3, the exit-gate evidence;
- ADR 0007 for the parser dependencies.

## Left to the builder

- The fact schema's exact field names, within the shapes above.
- The internal structure of `packages/analyzers`, and catalog file formats, provided they are data that tests can read.
- Symbols, colours and the exact copy in the Studio, within the existing visual language.
- How lifting labels a lifted edge in the canvas, provided the reason is visible in the inspector.
