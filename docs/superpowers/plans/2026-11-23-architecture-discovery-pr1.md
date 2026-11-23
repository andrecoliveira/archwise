# Architecture Discovery PR 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Phase 3 inventory into a system-level architecture graph. It shows frontends, services, datastores, queues and external systems, and every item carries its evidence and confidence. The graph is built from package manifests, workspace membership, Docker Compose and Prisma schemas. The Studio opens on a System view.

**Architecture:**
- **Contract and runner:** an analyzer contract and runner in `@archwise/application`.
- **Built-in analyzers:** pure functions in a new `@archwise/analyzers` package.
- **Input reading:** discovery reads only the files the analyzers declare, and never the deny list.
- **Resolver:** `resolveArchitecture` in `@archwise/application` merges inventory and facts into view graph v2. The CLI maps that graph to the `archwise.graph` v1 revision.
- **Studio:** consumes v2, upgrades stored v1 views, and lifts hidden-library edges in a pure System-view function.

**Tech Stack:** TypeScript, pnpm/Turbo, Vitest, `node:test` integration scripts, Svelte 5 + `@xyflow/svelte`, and `yaml@2.9.1` (new).

**Spec:** `docs/superpowers/specs/2026-11-23-architecture-discovery-design.md`. PR 1 sections: "Analyzer contract", "Built-in analyzers in PR 1", "Identity and merging", "View graph v2", "Studio (PR 1)", "Tests" and "Documentation".

## Global Constraints

- Always run pnpm as `npx --yes pnpm@10.34.9`. Never run Prettier on `docs/`.
- **Commits:**
  - signed off with `git commit -s` (identity André Oliveira, already configured);
  - message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
  - work on the branch `feat/architecture-discovery-pr1`, created from `main`.
- **Execution and secrets:**
  - Analyzers never touch the filesystem and never execute anything.
  - Compose `environment`, `env_file`, `secrets`, `command` and `entrypoint`, and Prisma `url`, are never emitted, stored, logged or shown.
  - The deny list is never read: `.env`, `.env.*`, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, and anything under `.ssh/`, `.aws/` or `.gnupg/`.
- **Compatibility:**
  - Package node IDs stay `package:<path>` (single root) and `package:<rootId>/<path>` (several roots).
  - Package-to-package edges keep `dependency:<src>-><tgt>`. Every other edge is `<kind>:<src>-><tgt>`.
  - Module revision IDs keep `mod-` + `shortHash(key)`.
- `archwise.graph` stays version 1. The only domain change is adding the node kind `frontend`.
- **Confidence:** `observed` means a file states it. `inferred` means Archwise deduced it. A client library is never `observed`.
- **Ambiguity:** draw no edge and add a diagnostic naming the candidates.
- **Determinism:** sort with `compareCodeUnits` (from `@archwise/domain`), never by locale. Two runs over the same files are byte-identical.
- **Revision status:** gaps are `info` and never make a revision `partial`. A failed analyzer does.
- **YAML:** `yaml@2.9.1` exactly, `parseDocument` with `{ schema: 'core', uniqueKeys: true, maxAliasCount: 100, prettyErrors: false }`. A document with errors is a gap `invalid-syntax`.
- `--json` (inventory v2) output is unchanged byte for byte.

## Review Focus

1. **A Compose file with YAML anchors, aliases or merge keys,** in real-world style (`<<: *defaults`). It must parse within the 100-alias limit, and an alias bomb must become an `invalid-syntax` gap, not a hang. Test in Task 6.
2. **A repository with workspace globs that exclude a folder with `!`, plus a stray `package.json` under `examples/`.** The stray package must be flagged outside the workspace. Members matched by `apps/*` and `packages/**` must stay members. Test in Task 5.
3. **A hidden library chain `api → @app/core → @app/db → pg`.** The System view must show `api → PostgreSQL` once, with reason `via @app/core, @app/db`. It must not draw a duplicate when `api` also depends on `pg` directly. Test in Task 11.
4. **A stored Phase 3 session view (v1) whose architecture is now different.** It must upgrade to v2 with the same IDs, so the "architecture changed" notice still appears and the Sandbox signature still matches. Test in Task 11.
5. **An analyzer that throws on one repository but succeeds on another.** Only the failing repository's facts are dropped. Its coverage is `failed` and the revision is `partial`. Package nodes are still present. Tests in Tasks 2 and 9.

---

### Task 1: Domain `frontend` kind and ADR 0007

**Files:**
- Modify: `packages/domain/src/graph.ts` (the `NODE_KINDS` array)
- Create: `docs/decisions/0007-parser-dependencies.md`
- Test: `packages/domain/tests/validation.test.ts`, plus an existing schemas test file that round-trips a revision

**Interfaces:**
- Produces: `NodeKind` now includes `'frontend'`, inserted after `'service'`.

- [ ] **Step 1: Write the failing tests.**
  - Domain: `test('accepts a frontend node')` builds a minimal valid revision (copy the existing valid-revision helper) with one node of `kind: 'frontend'`. It asserts that validation returns no problems.
  - Schemas: `test('parses a revision with a frontend node')` asserts `parseGraph` returns ok.
- [ ] **Step 2: Run them.** `npx --yes pnpm@10.34.9 vitest run packages/domain packages/schemas`. Expected: both FAIL, because the kind `frontend` is not one of the allowed values.
- [ ] **Step 3: Add `'frontend'` to `NODE_KINDS`.**
- [ ] **Step 4: Run again.** Expected: PASS. All existing domain and schemas tests still pass.
- [ ] **Step 5: Write ADR 0007, "Parser dependencies for architecture discovery".** Status Accepted, date 2026-11-23. Copy the decision text for `yaml` and `typescript` from the spec's Constraints section.
  - `yaml@2.9.1`: zero dependencies, YAML 1.2 core schema, alias limit, no custom tags.
  - `typescript`: adopted in PR 2 as a runtime dependency, parser API only.
  - Rejected alternatives:
    - `js-yaml`: the default schema is broader;
    - a hand-written YAML subset: known source of security bugs;
    - `@babel/parser` / `oxc-parser`: a second toolchain, and oxc needs native binaries.
- [ ] **Step 6: Commit.** `git commit -s -m "feat(domain): add frontend node kind; ADR 0007 parser dependencies"`

### Task 2: Analyzer contract and runner

**Files:**
- Create: `packages/application/src/analyzer.ts` (contract types and the `isFact` validator)
- Create: `packages/application/src/run-analyzers.ts`
- Modify: `packages/application/src/index.ts` (export both)
- Test: `packages/application/tests/run-analyzers.test.ts`

**Interfaces:**
- Produces, from `@archwise/application`:

```ts
export type ResourceKind = 'datastore' | 'queue' | 'external-system';
export type FactConfidence = 'observed' | 'inferred';
export interface FactEvidence {
  readonly path: string; // repository-relative, '/'-separated
  readonly lines: { readonly start: number; readonly end: number } | null;
  readonly ruleId: string;
}
export type FactRef =
  | { readonly package: string } // repository-relative manifest path, e.g. 'apps/api/package.json'
  | { readonly compose: { readonly file: string; readonly service: string } }
  | { readonly resource: { readonly kind: ResourceKind; readonly technology: string } };
export type Fact =
  | { readonly type: 'package-role'; readonly package: string; readonly role: 'frontend' | 'service';
      readonly technology: string; readonly confidence: FactConfidence; readonly reason: string;
      readonly evidence: readonly FactEvidence[] }
  | { readonly type: 'outside-workspace'; readonly package: string; readonly evidence: readonly FactEvidence[] }
  | { readonly type: 'resource'; readonly kind: ResourceKind; readonly technology: string; readonly label: string;
      readonly confidence: FactConfidence;
      readonly compose: { readonly file: string; readonly service: string } | null;
      readonly evidence: readonly FactEvidence[] }
  | { readonly type: 'compose-service'; readonly file: string; readonly service: string;
      readonly package: string | null; readonly image: string | null; readonly evidence: readonly FactEvidence[] }
  | { readonly type: 'datastore-technology'; readonly package: string; readonly technology: string;
      readonly label: string; readonly evidence: readonly FactEvidence[] }
  | { readonly type: 'relation'; readonly kind: 'depends-on'; readonly from: FactRef; readonly to: FactRef;
      readonly confidence: FactConfidence; readonly reason: string; readonly evidence: readonly FactEvidence[] };
export const GAP_REASONS = ['unsupported', 'invalid-syntax', 'too-large', 'binary', 'unreadable', 'budget',
  'unmatched-build-context', 'unidentified-datastore'] as const;
export type GapReason = (typeof GAP_REASONS)[number];
export interface CoverageGap { readonly path: string; readonly reason: GapReason }
export interface PackageFact {
  readonly path: string;        // repository-relative manifest path
  readonly directory: string;   // '' for the repository root
  readonly name: string;
  readonly dependencies: readonly string[];      // runtime only
  readonly devDependencies: readonly string[];
  readonly workspaces: readonly string[] | null; // package.json "workspaces" (array or {packages})
}
export interface AnalyzerDescriptor {
  readonly id: string; readonly version: string;
  readonly inputs: { readonly fileNames: readonly string[]; readonly extensions: readonly string[] };
  readonly budget: { readonly timeMs: number; readonly maxFiles: number };
}
export interface AnalyzerInput {
  readonly repository: { readonly id: string; readonly label: string };
  readonly files: readonly { readonly path: string; readonly text: string }[];
  readonly packages: readonly PackageFact[];
  readonly deadline: number;
  readonly signal: AbortSignal;
  readonly now: () => number;
}
export interface AnalyzerOutput {
  readonly status: 'complete' | 'partial';
  readonly facts: readonly Fact[];
  readonly gaps: readonly CoverageGap[];
}
export interface Analyzer { readonly descriptor: AnalyzerDescriptor; analyze(input: AnalyzerInput): AnalyzerOutput }
export function shouldStop(input: AnalyzerInput): boolean; // input.signal.aborted || input.now() > input.deadline
export function isFact(value: unknown): value is Fact;     // hand-written structural check, strict keys

export interface AnalyzerFileCandidate {
  readonly path: string; // repository-relative
  readonly text: string | null;
  readonly problem: 'too-large' | 'binary' | 'unreadable' | null;
}
export interface AnalysisRepositoryInput {
  readonly repository: { readonly id: string; readonly label: string };
  readonly files: readonly AnalyzerFileCandidate[];
  readonly packages: readonly PackageFact[];
}
export interface AnalysisResult {
  readonly facts: readonly { readonly analyzerId: string; readonly analyzerVersion: string;
                             readonly repositoryId: string; readonly fact: Fact }[];
  readonly coverage: readonly { readonly repositoryId: string; readonly analyzerId: string;
                                readonly analyzerVersion: string; readonly status: 'complete' | 'partial' | 'failed' }[];
  readonly gaps: readonly { readonly repositoryId: string; readonly analyzerId: string;
                            readonly path: string; readonly reason: GapReason }[];
  readonly failures: readonly { readonly repositoryId: string; readonly analyzerId: string }[];
}
export const EMPTY_ANALYSIS: AnalysisResult;
export function analyzerInputs(analyzers: readonly Analyzer[]): { fileNames: string[]; extensions: string[] }; // union, sorted, unique
export function runAnalyzers(request: {
  readonly analyzers: readonly Analyzer[];
  readonly repositories: readonly AnalysisRepositoryInput[];
  readonly now?: () => number;
  readonly signal?: AbortSignal;
}): AnalysisResult;
```

**Runner rules:**
- **Order:** analyzers in `descriptor.id` order; repositories in input order.
- **File routing:**
  - A file goes to an analyzer when its base name is in `fileNames`, or its name ends with one of the `extensions`.
  - A routed candidate with a `problem` becomes a gap for that analyzer, with the problem as its reason, and is not passed in.
  - Files beyond `maxFiles`, taken in path order, become `budget` gaps, and the status becomes `partial`.
- **Deadline:** `now() + budget.timeMs`.
- **Failure:** an analyzer has failed for a repository when it throws, returns a non-object, returns any fact that fails `isFact`, or finishes after the deadline. Then:
  - its coverage is `failed`;
  - it is added to `failures`;
  - all of its facts and gaps for that repository are dropped.
- **Abort:** an abort (`signal.aborted` before or after a call) rethrows `signal.reason`.
- **Gaps:** an analyzer's own gaps are kept, with `repositoryId` and `analyzerId` added.
- **Output sort:** facts and gaps are sorted by `(repositoryId, analyzerId)` and then kept in emission order. The test pins this.

- [ ] **Step 1: Write the failing tests** in `run-analyzers.test.ts`, with tiny inline analyzers:
  - `routes files by name and extension and passes repository-relative text`: a descriptor declares `fileNames: ['compose.yaml']` and `extensions: ['.prisma']`; its `analyze` records `input.files.map(f => f.path)`. Expect `['compose.yaml', 'db/schema.prisma']`, and `x.ts` is not passed.
  - `a throwing analyzer fails only its own repository`: the analyzer throws when `repository.id === 'repo-b'`. Expect:
    - `coverage` = `[{repo-a, complete}, {repo-b, failed}]`;
    - `failures` = `[{ repositoryId: 'repo-b', analyzerId }]`;
    - only the repo-a fact is present;
    - a second, healthy analyzer still has facts in both repositories.
  - `an invalid fact fails the analyzer`: one fact `{ type: 'resource', kind: 'cache' }` → coverage `failed`, no facts.
  - `finishing after the deadline fails the analyzer`: an injected `now` advances by `timeMs + 1` inside `analyze` → `failed`.
  - `partial status is kept`: `status: 'partial'` → coverage `partial`.
  - `problem files become gaps`: a candidate `{ path: 'compose.yaml', text: null, problem: 'too-large' }` → gap `{ path: 'compose.yaml', reason: 'too-large' }`, and `analyze` receives no files.
  - `maxFiles overflow becomes budget gaps`: `maxFiles: 1` and two matching files → one file passed, gap `budget` for the second in path order, coverage `partial`.
  - `abort rethrows`: an already-aborted signal → `runAnalyzers` throws an `AbortError`.
  - `version is carried`: version `'2.0.0'` appears in both the coverage row and `facts[0].analyzerVersion`.
  - `isFact rejects unknown keys`: a valid `relation` plus `extra: 1` → `false`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run packages/application/tests/run-analyzers.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `analyzer.ts` and `run-analyzers.ts`** as specified. `isFact` checks every union member strictly: exact key sets, enum values, and evidence arrays of `{path:string, lines: null | {start:int>=1, end:int>=start}, ruleId:string}`.
- [ ] **Step 4: Run again.** Expected: PASS. Run the whole application suite: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(application): analyzer contract and isolated runner"`

### Task 3: Discovery reads analyzer inputs; manifests keep runtime dependencies and workspaces

**Files:**
- Modify: `packages/application/src/inventory.ts`:
  - `InventoryRequest.inputs?`
  - `InventoryResult.files`
  - `InventoryManifest.runtimeDependencies`, `devDependencies` and `workspaces`
- Modify: `packages/discovery/src/manifest.ts`, `packages/discovery/src/walker.ts`
- Create: `packages/discovery/src/deny-list.ts`
- Create: `packages/application/src/analysis-inputs.ts` (`analysisInputs`)
- Modify: `apps/cli/src/inventory-output.ts` (`portableInventory` manifests allowlist)
- Modify: `apps/cli/tests/inventory-fixture.ts`, and every test that hand-builds an `InventoryManifest` (add the three new fields)
- Test: `packages/discovery/tests/walker.test.ts`, `packages/discovery/tests/deny-list.test.ts`, `packages/application/tests/analysis-inputs.test.ts`, `apps/cli/tests/inventory-output.test.ts`

**Interfaces:**
- Consumes: `AnalysisRepositoryInput` and `PackageFact` (Task 2).
- Produces:

```ts
// inventory.ts additions
export interface InventoryFile {
  readonly repositoryId: string; readonly rootId: string;
  readonly path: string;                     // root-relative, like manifests
  readonly text: string | null;              // UTF-8; null when problem !== null
  readonly problem: 'too-large' | 'binary' | 'unreadable' | null;
}
// InventoryRequest: readonly inputs?: { readonly fileNames: readonly string[]; readonly extensions: readonly string[] };
// InventoryResult:  readonly files: readonly InventoryFile[];   // process-local, never serialized
// InventoryManifest: readonly runtimeDependencies: readonly string[]; readonly devDependencies: readonly string[];
//                    readonly workspaces: readonly string[] | null;
// deny-list.ts
export function isDeniedInput(rootRelativePath: string): boolean;
// analysis-inputs.ts
export function analysisInputs(inventory: InventoryResult): AnalysisRepositoryInput[];
```

**Rules:**
- `analysisInputs` converts root-relative paths to repository-relative ones by stripping `repository.path + '/'`.
- `PackageFact` comes from `InventoryManifest`:
  - `directory` is the manifest's directory, repository-relative, or `''`;
  - `dependencies` is `runtimeDependencies`.
- Repositories with `reached: false` are omitted.
- Output is sorted by repository ID, and files by path.
- `package.json` is never in `files`: manifests are already parsed. Only the other declared inputs are read.
- An input file counts against `bytesPerFile` and `bytesTotal`. Over `bytesPerFile` → `problem: 'too-large'`, and it is also counted in the existing `too-large` skip.
- The NUL sniff → `binary`; a read error → `unreadable`.
- **Workspaces** are read from:
  - `workspaces: string[]`;
  - `workspaces: { packages: string[] }`;
  - otherwise `null`.

  Non-string entries are dropped, and the values pass through `redactSensitiveText` like names.

- [ ] **Step 1: Write the failing tests:**
  - `deny-list.test.ts`, with `test.each`:
    - `true` for `.env`, `apps/api/.env.local`, `certs/server.pem`, `k.key`, `id_rsa`, `id_rsa.pub`, `.npmrc`, `.netrc`, `home/.ssh/config`, `x/.aws/credentials` and `.gnupg/pubring.kbx`;
    - `false` for `compose.yaml`, `environment.ts`, `keys.ts` and `docs/.envrc.md`.
  - `walker.test.ts`:
    - `reads declared inputs and never deny-listed files`: a fixture with `compose.yaml`, `db/schema.prisma`, `.env` (content `SECRET=1`) and `src/a.ts`, scanned with `inputs: { fileNames: ['compose.yaml', '.env'], extensions: ['.prisma'] }`. Expect `files.map(f => f.path)` to equal `['compose.yaml', 'db/schema.prisma']`, and no file text anywhere to contain `SECRET`.
    - `an oversized input is reported, not read`: `bytesPerFile: 10` and a 20-byte `compose.yaml` → `{ text: null, problem: 'too-large' }`.
    - `a binary input is reported`: `compose.yaml` with a NUL byte → `problem: 'binary'`.
    - `without inputs nothing extra is read`: `files` equals `[]`, and `bytesRead` equals the manifests' size.
  - `manifest` (inside walker tests or a new `manifest.test.ts`): `{"dependencies":{"pg":"1"},"devDependencies":{"vitest":"1"},"workspaces":{"packages":["apps/*"]}}` gives:
    - `runtimeDependencies` `['pg']`;
    - `devDependencies` `['vitest']`;
    - `dependencies` `['pg','vitest']` (unchanged);
    - `workspaces` `['apps/*']`.
  - `analysis-inputs.test.ts`: a nested repository at `vendor/lib`, with manifest `vendor/lib/package.json` and file `vendor/lib/compose.yaml`. Expect the package fact `{ path: 'package.json', directory: '' }` and the file path `compose.yaml` under that repository. An unreached repository is absent.
  - `inventory-output.test.ts`: `portable --json manifests keep the Phase 3 fields only`. Expect `Object.keys(portable.manifests[0])` to equal `['repositoryId','rootId','path','name','framework','dependencies','sha256']`, and `files` to be absent.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run packages/discovery packages/application apps/cli/tests/inventory-output.test.ts`. Expected: FAIL on the missing functions and fields.
- [ ] **Step 3: Implement.** In the walker, the `entry.name !== MANIFEST` branch keeps the manifest path and adds input reading for matching, non-denied names. Use the existing `readBounded` and `looksBinary`. Update hand-built manifests in tests with `runtimeDependencies: []`, `devDependencies: []` and `workspaces: null`. Pick values per test where needed.
- [ ] **Step 4: Run** `npx --yes pnpm@10.34.9 vitest run`. Expected: PASS. Then run `node --test scripts/tests/*.test.mjs` after `npx --yes pnpm@10.34.9 build`. Expected: PASS. The `--json` output is unchanged.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(discovery): read declared analyzer inputs behind a deny list"`

### Task 4: `@archwise/analyzers` package and `node-roles` analyzer

**Files:**
- Create the `packages/analyzers/` package, mirroring `packages/discovery`: `package.json` (name `@archwise/analyzers`, depends on `@archwise/application` and `@archwise/domain`), `tsconfig.json`, `tsconfig.check.json`, `vitest.config.ts`, `README.md` and `src/index.ts`.
- Create: `packages/analyzers/src/catalog.ts` (the role, client-library and image catalogs, as exported readonly data)
- Create: `packages/analyzers/src/node-roles.ts`
- Modify: `.dependency-cruiser.mjs`, adding the rule `analyzers-inward-only`: from `^packages/analyzers/src/` to `{ pathNot: '^(packages/(analyzers|application|domain)/|node_modules/(\\.pnpm/[^/]+/node_modules/)?yaml/)' }`. Node core modules do not match `pathNot`, so they are forbidden too: analyzers are pure. Path helpers such as POSIX normalize live in `packages/analyzers/src/paths.ts`, not in `node:path`.
- Modify: root `vitest` workspace or config if packages are listed explicitly, and `tsconfig` references if used.
- Test: `packages/analyzers/tests/node-roles.test.ts`

**Interfaces:**
- Consumes: `Analyzer` and `Fact` (Task 2).
- Produces:
  - `export const nodeRoles: Analyzer`, with descriptor `{ id: 'node-roles', version: '1.0.0', inputs: { fileNames: [], extensions: [] }, budget: { timeMs: 2000, maxFiles: 0 } }`;
  - `export const ROLE_CATALOG: readonly { dependency: string; role: 'frontend' | 'service' }[]`, in the spec's priority order;
  - `export const LIBRARY_CATALOG: readonly { dependency: string; kind: ResourceKind; technology: string; label: string }[]`;
  - `export const IMAGE_CATALOG: readonly { image: string; kind: ResourceKind; technology: string; label: string }[]`;
  - `export const UNKNOWN_SQL = { technology: 'unknown-sql', label: 'Database (unknown engine)' }`.

**Catalog values:**
- **ROLE_CATALOG:**
  - frontend: `next`, `nuxt`, `@sveltejs/kit`, `@remix-run/react`, `astro`, `@angular/core`, `vue`, `svelte`, `solid-js`, `react-dom`, `expo`, `react-native`;
  - service: `express`, `fastify`, `@nestjs/core`, `koa`, `hono`, `@hapi/hapi`, `@apollo/server`, `@trpc/server`.
- **LIBRARY_CATALOG** (technology / label):
  - datastores:
    - `pg`, `postgres` → `postgresql`/`PostgreSQL`;
    - `mysql2` → `mysql`/`MySQL`;
    - `mongodb`, `mongoose` → `mongodb`/`MongoDB`;
    - `redis`, `ioredis` → `redis`/`Redis`;
    - `better-sqlite3` → `sqlite`/`SQLite`;
    - `@elastic/elasticsearch` → `elasticsearch`/`Elasticsearch`;
    - `@aws-sdk/client-dynamodb` → `dynamodb`/`DynamoDB`;
    - `@prisma/client`, `typeorm`, `sequelize`, `drizzle-orm`, `knex` → `unknown-sql`.
  - queues:
    - `bullmq`, `bull` → `bullmq`/`BullMQ`;
    - `amqplib` → `rabbitmq`/`RabbitMQ`;
    - `kafkajs` → `kafka`/`Kafka`;
    - `@aws-sdk/client-sqs` → `sqs`/`Amazon SQS`;
    - `@google-cloud/pubsub` → `pubsub`/`Google Pub/Sub`;
    - `nats` → `nats`/`NATS`.
  - external systems:
    - `stripe`/`Stripe`;
    - `@sendgrid/mail` → `sendgrid`/`SendGrid`;
    - `resend`/`Resend`;
    - `twilio`/`Twilio`;
    - `@aws-sdk/client-s3` → `s3`/`Amazon S3`;
    - `firebase-admin` → `firebase`/`Firebase`;
    - `@sentry/node` → `sentry`/`Sentry`;
    - `openai`/`OpenAI`;
    - `@anthropic-ai/sdk` → `anthropic`/`Anthropic`;
    - `@slack/web-api` → `slack`/`Slack`.
- **IMAGE_CATALOG:**
  - `postgres`, `mysql`, `mariadb` (→ `mysql`), `mongo` (→ `mongodb`), `redis`, `valkey/valkey` and `valkey` (→ `redis`), and `elasticsearch` → datastore;
  - `minio/minio` → datastore `s3`/`Amazon S3-compatible (MinIO)`;
  - `rabbitmq`, `confluentinc/cp-kafka` and `bitnami/kafka` (→ `kafka`), and `nats` → queue.

**`node-roles` rules:**
- **Roles:** for each package, every `ROLE_CATALOG` match against `dependencies ∪ devDependencies`.
  - The first match in catalog order decides the role and technology, with frontend winning over service.
  - One `package-role` fact is emitted, `inferred`, with reason `framework-dependency:<dep>` and evidence `{ path: pkg.path, lines: null, ruleId: 'framework-dependency' }`.
  - When both a frontend and a service signal exist, the reason is `framework-dependency:<frontendDep>,<serviceDep>`.
- **Resources:** for each `LIBRARY_CATALOG` match against runtime `dependencies` only, one `relation` fact:
  - `from: { package }`, `to: { resource: { kind, technology } }`;
  - `inferred`, reason `client-library:<dep>`, ruleId `client-library`.

  One `resource` fact per distinct `(kind, technology)` in the repository, `inferred`, `compose: null`, carrying the label.
- Emission is sorted by package path, then dependency.

- [ ] **Step 1: Write the failing tests:**
  - `classifies frontend over service and records both signals`: `{ dependencies: ['next','express'] }` → role `frontend`, technology `next`, reason `framework-dependency:next,express`.
  - `client libraries become inferred resources from runtime dependencies only`: dependencies `['pg','stripe']` and devDependencies `['mysql2']` → resources `postgresql` and `stripe` only, relations with reasons `client-library:pg` and `client-library:stripe`, every confidence `inferred`.
  - `an ORM without a known engine targets unknown-sql`: `['@prisma/client']` → relation to `{ resource: { kind: 'datastore', technology: 'unknown-sql' } }`.
  - `every emitted fact passes isFact`, over a package using every catalog entry.
  - `a package with no matches emits nothing`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run packages/analyzers`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the package, the catalogs and `nodeRoles`. Run `npx --yes pnpm@10.34.9 install` so the workspace links.
- [ ] **Step 4: Run** the tests, then `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 boundaries && npx --yes pnpm@10.34.9 lint`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(analyzers): node-roles analyzer and catalogs"`

### Task 5: `node-workspace` analyzer

**Files:**
- Create: `packages/analyzers/src/workspace-globs.ts`, `packages/analyzers/src/node-workspace.ts`
- Modify: `packages/analyzers/package.json` (add `"yaml": "2.9.1"`), and `pnpm-lock.yaml` via install
- Test: `packages/analyzers/tests/node-workspace.test.ts`, `packages/analyzers/tests/workspace-globs.test.ts`

**Interfaces:**
- Produces:
  - `export const nodeWorkspace: Analyzer`, with descriptor `{ id: 'node-workspace', version: '1.0.0', inputs: { fileNames: ['pnpm-workspace.yaml', 'nx.json', 'project.json', 'lerna.json'], extensions: [] }, budget: { timeMs: 2000, maxFiles: 2000 } }`;
  - `export function matchesWorkspaceGlob(directory: string, patterns: readonly string[]): boolean`.
- Shared parser: `export function parseYaml(text: string): { ok: true; value: unknown } | { ok: false }` in `packages/analyzers/src/yaml.ts`, using the Global Constraints options. Errors or warnings → `{ ok: false }`.

**Rules:**
- **Patterns** come from the root `package.json` (`packages.find(p => p.directory === '')?.workspaces`) united with `pnpm-workspace.yaml` `packages` (string entries only) at the repository root.
- **No patterns:** no facts.
- **Globs:**
  - `*` matches one path segment; `**` matches zero or more segments;
  - a trailing `/` is ignored, and so is a leading `./`;
  - patterns starting with `!` exclude, and the last matching pattern wins.
- **Membership:** the root package is always a member. Every other package whose `directory` does not match emits `outside-workspace`, with evidence `{ path: pkg.path, ruleId: 'outside-workspace' }`.
- **Gaps:**
  - `nx.json`, `project.json` and `lerna.json` (any path) → `unsupported`;
  - an unparseable `pnpm-workspace.yaml` → `invalid-syntax`, and its patterns are ignored.

- [ ] **Step 1: Write the failing tests:**
  - `workspace-globs.test.ts`, with `test.each`:
    - `('apps/web', ['apps/*'])` → true;
    - `('apps/web/sub', ['apps/*'])` → false;
    - `('packages/a/b', ['packages/**'])` → true;
    - `('packages/legacy', ['packages/*', '!packages/legacy'])` → false;
    - `('examples/demo', ['apps/*', 'packages/**'])` → false;
    - `('tools/x', ['./tools/*/'])` → true.
  - `node-workspace.test.ts`:
    - `flags packages outside pnpm workspace globs`: root plus `apps/web`, `packages/db` and `examples/demo`; `pnpm-workspace.yaml` = `packages:\n  - 'apps/*'\n  - 'packages/*'\n` → exactly one `outside-workspace` fact, for `examples/demo/package.json`.
    - `reads package.json workspaces object form`: root `workspaces: ['apps/*']` → `packages/db` is flagged.
    - `no declarations means everyone is a member` → no facts.
    - `nx files are unsupported gaps` → gaps `[{ path: 'nx.json', reason: 'unsupported' }, { path: 'apps/web/project.json', reason: 'unsupported' }]`, sorted by path.
    - `invalid pnpm-workspace.yaml is an invalid-syntax gap and is ignored`, with text `packages: [`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run packages/analyzers`. Expected: FAIL.
- [ ] **Step 3: Implement.** Add the `yaml` dependency and run install.
- [ ] **Step 4: Run** the tests. Expected: PASS. Then run `npx --yes pnpm@10.34.9 boundaries`: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(analyzers): node-workspace membership analyzer"`

### Task 6: `docker-compose` analyzer

**Files:**
- Create: `packages/analyzers/src/docker-compose.ts`, `packages/analyzers/src/paths.ts` (`joinPosix`, `normalizePosix`, `dirnamePosix`, `basenamePosix`)
- Test: `packages/analyzers/tests/docker-compose.test.ts`

**Interfaces:**
- Consumes: `parseYaml` (Task 5) and `IMAGE_CATALOG` (Task 4).
- Produces: `export const dockerCompose: Analyzer`, with descriptor:
  - `id: 'docker-compose'`, `version: '1.0.0'`;
  - `inputs.fileNames`: `['compose.yaml','compose.yml','docker-compose.yaml','docker-compose.yml']`;
  - `budget: { timeMs: 3000, maxFiles: 200 }`.

**Rules:** applied per file, with `file` = its repository-relative path and `dir` = its directory.
- **Invalid files:** a parse failure, or a `services` value that is not a mapping → gap `invalid-syntax`.
- **Override files:** `inputs.fileNames` also lists `docker-compose.override.yml`, `docker-compose.override.yaml`, `compose.override.yaml` and `compose.override.yml`. The analyzer emits gap `unsupported` for them without parsing. Other `compose.<x>.yaml` variants are not routed at all; `docs/discovery.md` says so. This is a ruling, because routing is by exact name and the spec's `compose.*.yaml` pattern cannot be expressed in this contract.
- **A service with `image: string`:**
  - Normalize: strip the digest `@…` and the tag `:…` after the last `/`. Strip a registry host: the first segment, when there are 2 or more segments and it contains `.` or `:` or equals `localhost`. Strip `library/`. Lowercase.
  - A catalog match → a `resource` fact, `observed`, `compose: { file, service }`, label from the catalog, evidence ruleId `compose-image`.
  - Otherwise, if it has no `build` → `compose-service` with `image` = the normalized name and `package: null`, ruleId `compose-service`.
- **A service with `build`** (a string context, or `{ context }`, default `.`):
  - Resolve `normalizePosix(joinPosix(dir, context))` from `paths.ts`; `'.'` becomes `''`.
  - Find the package with that `directory`. If found → `compose-service` with `package: pkg.path` and `image: null`, ruleId `compose-build`.
  - If not found → `compose-service` with `package: null` and `image: null`, plus gap `{ path: file, reason: 'unmatched-build-context' }`.
  - A context that leaves the repository (it starts with `..`) also counts as unmatched.
  - An `${…}` in the context means unmatched.
- **`depends_on`** (array of strings, or a mapping's keys) → `relation` facts `from: { compose: { file, service } }`, `to: { compose: { file, service: dep } }`, `observed`, reason `compose-depends-on`, ruleId `compose-depends-on`. Only for deps that are services in the same file.
- **Never read:** the keys `environment`, `env_file`, `secrets`, `command`, `entrypoint`, `healthcheck` and `labels`. The analyzer accesses only `image`, `build` and `depends_on`.
- Service names are emitted as-is. The resolver redacts labels.

- [ ] **Step 1: Write the failing tests:**
  - `catalog images become observed resources`:
    - services `db: { image: 'postgres:16' }`, `cache: { image: 'docker.io/library/redis:7@sha256:abc' }`, `mq: { image: 'bitnami/kafka' }`;
    - expect resources `postgresql`/`db`, `redis`/`cache` and `kafka`/`mq`, all `observed`, with `compose.file === 'compose.yaml'`.
  - `build contexts link packages`: `api: { build: './apps/api' }`, `worker: { build: { context: 'apps/api' } }`, with package `apps/api` → two `compose-service` facts, both with `package: 'apps/api/package.json'`.
  - `an unmatched build context is a gap`: `build: './nowhere'` → `compose-service` with `package: null`, plus gap `unmatched-build-context`.
  - `depends_on list and map forms`: `api: { depends_on: ['db'] }` and `worker: { depends_on: { db: { condition: 'service_healthy' } } }` → two relations to `{ compose: { file, service: 'db' } }`.
  - `secrets never appear in facts`:
    - service `api: { image: 'node', environment: { DATABASE_URL: 'postgres://u:hunter2@h/db' }, command: 'echo hunter2', env_file: '.env' }`;
    - expect `JSON.stringify(output)` not to contain `hunter2`, `DATABASE_URL` or `.env`.
  - `interpolation stays literal`: `image: '${REGISTRY}/postgres:16'` → normalized `postgres` matches the catalog (the `${REGISTRY}` segment contains no `.` or `:`). **Ruling:** treat a first segment containing `${` as a registry and strip it. The test pins `postgresql`.
  - `real-world anchors and merge keys parse`: `x-common: &c\n  image: redis:7\nservices:\n  cache:\n    <<: *c\n` → resource `redis`.
  - `an alias bomb is an invalid-syntax gap`: the classic nested-alias document (`a: &a [x,x,x,x,x,x,x,x,x]`, `b: &b [*a,*a,…×9]`, … up to `i`) → gap `invalid-syntax`, no facts, completing within 1 s.
  - `duplicate keys are invalid`: `services:\n  a: {image: redis}\n  a: {image: postgres}` → gap `invalid-syntax`.
  - `override files are unsupported`: `docker-compose.override.yml` → gap `unsupported`, no facts.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(analyzers): docker-compose analyzer (data only, secrets dropped)"`

### Task 7: `prisma-schema` analyzer

**Files:**
- Create: `packages/analyzers/src/prisma-schema.ts`
- Modify: `packages/analyzers/src/index.ts`, which exports `BUILTIN_ANALYZERS: readonly Analyzer[] = [dockerCompose, nodeRoles, nodeWorkspace, prismaSchema]` (sorted by ID)
- Test: `packages/analyzers/tests/prisma-schema.test.ts`, `packages/analyzers/tests/builtins.test.ts`

**Interfaces:**
- Produces:
  - `export const prismaSchema: Analyzer`, with descriptor `{ id: 'prisma-schema', version: '1.0.0', inputs: { fileNames: [], extensions: ['.prisma'] }, budget: { timeMs: 2000, maxFiles: 500 } }`;
  - `export const BUILTIN_ANALYZERS`.

**Rules:**
- Strip `//` line comments.
- Find `datasource <name> {` … the matching `}`. Inside it, find `provider = "<value>"`, a literal string only.
- **Mapping:**
  - `postgresql` → `postgresql`/`PostgreSQL`;
  - `mysql` → `mysql`/`MySQL`;
  - `sqlite` → `sqlite`/`SQLite`;
  - `sqlserver` → `sqlserver`/`SQL Server`;
  - `mongodb` → `mongodb`/`MongoDB`;
  - `cockroachdb` → `cockroachdb`/`CockroachDB`.
- **Owner:** the package whose `directory` is the longest prefix of the file's directory (the root package, `''`, counts).
- **Result:** one `datastore-technology` fact with `lines` = the provider line (1-based), ruleId `prisma-datasource`.
- **Gaps and edge cases:**
  - no datasource block, or `provider = env("X")` → gap `unsupported`;
  - no owning package → no fact;
  - several datasources → one fact each.
- The `url` line is never read into anything.

- [ ] **Step 1: Write the failing tests:**
  - `reads the provider literal with its line`: `packages/db/prisma/schema.prisma` with `// comment\ndatasource db {\n  provider = "postgresql"\n  url = env("DATABASE_URL")\n}` → fact `{ package: 'packages/db/package.json', technology: 'postgresql', label: 'PostgreSQL', evidence: [{ path, lines: { start: 3, end: 3 }, ruleId: 'prisma-datasource' }] }`, and the output does not contain `DATABASE_URL`.
  - `an env provider is unsupported` → gap.
  - `builtins.test.ts`:
    - `BUILTIN_ANALYZERS are sorted, unique and versioned semver`;
    - `analyzerInputs(BUILTIN_ANALYZERS)` equals the exact sorted union.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(analyzers): prisma-schema analyzer and built-in set"`

### Task 8: Resolver and view graph v2 (golden fixture)

**Files:**
- Create: `packages/application/src/architecture.ts` (the v2 types, `viewNodeId`, `resolveArchitecture`)
- Modify: `packages/application/src/index.ts`
- Modify: `apps/cli/src/graph.ts`. It becomes `export { viewNodeId, type ArchitectureGraph, ... } from '@archwise/application'` plus `buildArchitectureGraph(inventory, analysis = EMPTY_ANALYSIS) = resolveArchitecture(inventory, analysis)`.
- Create: `packages/test-fixtures/src/system-fixture.ts` (`SYSTEM_FIXTURE: Readonly<Record<string,string>>`), exported from the index
- Create: `apps/cli/tests/system-fixture.test.ts`, with golden files `apps/cli/tests/golden/system-fixture.graph.json` and `.revision.json` (the revision golden is written in Task 9)
- Modify: `apps/cli/tests/graph.test.ts` (v2 shape)

**Interfaces:**
- Consumes: `AnalysisResult` (Task 2) and `InventoryResult` with `files` (Task 3).
- Produces:

```ts
export type ViewNodeType = 'frontend' | 'service' | 'module' | 'datastore' | 'queue' | 'external-system' | 'job';
export type ViewEdgeType = 'depends-on' | 'calls' | 'publishes' | 'consumes' | 'reads' | 'writes';
export interface ViewEvidence { readonly path: string; readonly kind: string;
  readonly lines: { readonly start: number; readonly end: number } | null; readonly analyzer: string }
export interface ArchitectureNode {
  readonly id: string; readonly type: ViewNodeType; readonly label: string; readonly technology: string | null;
  readonly confidence: 'observed' | 'inferred'; readonly reasons: readonly string[];
  readonly outsideWorkspace: boolean; readonly aliases: readonly string[]; // Compose service names linked to a package
  readonly origin: 'discovered'; readonly evidence: readonly ViewEvidence[];
  readonly repository?: { readonly id: string; readonly label: string };
}
export interface ArchitectureEdge {
  readonly id: string; readonly type: ViewEdgeType; readonly source: string; readonly target: string;
  readonly confidence: 'observed' | 'inferred'; readonly reasons: readonly string[];
  readonly origin: 'discovered'; readonly evidence: readonly ViewEvidence[];
}
export interface ViewGap { readonly path: string; readonly analyzer: string; readonly reason: GapReason }
export interface ArchitectureGraph {
  readonly version: 2; readonly nodes: readonly ArchitectureNode[]; readonly edges: readonly ArchitectureEdge[];
  readonly diagnostics: readonly string[]; readonly gaps: readonly ViewGap[]; readonly inspectedEntries: number;
}
export function viewNodeId(manifest: { rootId: string; path: string }, multiRoot: boolean): string; // moved, unchanged
export function resolveArchitecture(inventory: InventoryResult, analysis: AnalysisResult): ArchitectureGraph;
```

**Resolver rules.** Everything from today's `buildArchitectureGraph` is kept: ambiguity, unresolved-dependency and truncation diagnostics, `shown()` label prefixes, and the `repository` field only for multi-root. On top of that:
1. **Paths:**
   - Fact paths are repository-relative. Convert them to root-relative with `rootRel = repo.path === '' ? p : repo.path + '/' + p`.
   - View evidence uses root-relative paths, as today.
   - Gaps and diagnostics use `shown(rootRel)`.
2. **Package nodes:**
   - `type` is `module`, unless there is a role: any `frontend` → `frontend`; else a `service` role, or a `compose-service` with `package` → `service`.
   - **Confidence:** a compose link → `observed`; a role only → `inferred`; a module → `observed`.
   - `reasons`: `['manifest-declared']` for modules, otherwise the role reasons plus `compose-build:<service>` per link, sorted.
   - `technology`: the role technology ?? `manifest.framework`.
   - `outsideWorkspace`: true when an `outside-workspace` fact exists.
   - `aliases`: the linked Compose service names, sorted.
   - `evidence`: the manifest evidence `{ path, kind: 'package-manifest', lines: null, analyzer: 'node-manifest' }` first, then fact evidence.
3. **Compose nodes:**
   - A `resource` fact with `compose` → a node with id `compose:<rootPrefix><rootRel(file)>#<service>`, type = the kind, label = the service name (redacted with `redactSensitiveText(label, [])`), technology = the catalog label, `observed`.
   - A `compose-service` with `package: null` → the same ID scheme, type `service`, technology = image ?? null, `observed`, reason `compose-service`.
4. **Technology resources** gather `(kind, technology)` pairs across the workspace from `resource` facts with `compose: null`, and from relation targets. For each pair, count the Compose resource nodes with the same `(kind, technology)`:
   - **0:** a node `<kind-prefix>:<technology>` (`datastore:`, `queue:` or `external:`), with the catalog label, `inferred`, reason `client-library`, and no `repository`.
   - **1:** no node. Relations targeting the pair attach to that Compose node.
   - **More than 1:** the node is created as in the 0 case, plus the diagnostic `Ambiguous resource: <label> (<shown compose ids, sorted>)`.
5. **Prisma:**
   - Relations from package P to `unknown-sql` are retargeted to the `datastore-technology` of P, if P has one.
   - If P has a `datastore-technology` but no relation, the resolver adds one: `inferred`, reason `prisma-datasource`, with the schema's evidence.
   - An `unknown-sql` relation that remains → also the gap `{ path: shown(P), analyzer: 'node-roles', reason: 'unidentified-datastore' }`.
6. **Relation edges:**
   - Resolve `from` and `to`: package → node ID; compose → the linked package node, if any, otherwise the Compose node; resource → per rule 4.
   - Drop the relation if either end is missing or both ends are equal.
   - Edge ID: `depends-on:<src>-><tgt>`, unless a `dependency:` edge exists for the pair, in which case it merges into that edge.
   - **Merging edges:** evidence is unioned and sorted by `(path, kind)`. Reasons are unioned and sorted. Confidence is `observed` if any input is observed.
   - Package-to-package edges get `confidence: 'observed'`, `reasons: ['dependency-declared']`, and evidence `{ path, kind: 'package-dependency', lines: null, analyzer: 'node-manifest' }`.
7. **Failures:** each `analysis.failures` entry → the diagnostic `Analyzer failed: <analyzerId> in <repository label>. Its findings were discarded.`
8. **Gaps:** all `analysis.gaps` plus the resolver's own, mapped to `ViewGap`, unique, sorted by `(path, analyzer, reason)`.
9. **Sort order:** nodes by ID, edges by ID, diagnostics unique and sorted.

**`SYSTEM_FIXTURE` files** (exact content written in the test package):
- root `package.json`: `{"name":"shop","private":true}`;
- `pnpm-workspace.yaml` with `apps/*` and `packages/*`;
- `apps/web/package.json`: `next`, `react-dom`;
- `apps/api/package.json`: `fastify`, `@shop/db`, `stripe`;
- `apps/worker/package.json`: `bullmq`, `@shop/db`;
- `packages/db/package.json`: `@prisma/client`, `pg`;
- `packages/db/prisma/schema.prisma` with `provider = "postgresql"` and `url = env("DATABASE_URL")`;
- `compose.yaml` with:
  - `db: postgres:16`;
  - `cache: redis:7`;
  - `api: build ./apps/api, depends_on [db, cache]`;
  - `worker: build ./apps/worker, depends_on [cache]`;
- `examples/demo/package.json` with `express`;
- `.env` with `DATABASE_URL=postgres://u:secret@h/db`.

- [ ] **Step 1: Write the failing tests:**
  - `graph.test.ts`: update the existing assertions to the v2 shape. Packages are `type: 'module'`, `confidence: 'observed'` and `reasons: ['manifest-declared']`, and `gaps` equals `[]`. Keep the IDs as they are.
  - New: `without analysis the graph has only packages and no infrastructure`.
  - `system-fixture.test.ts`, which scans `SYSTEM_FIXTURE` through `filesystemInventory` with `analyzerInputs(BUILTIN_ANALYZERS)`, then `runAnalyzers`, then `buildArchitectureGraph`. Assertions:
    - `matches the golden graph`: deep equality with `golden/system-fixture.graph.json`. When `UPDATE_GOLDEN=1`, the test writes the golden file instead. Review the first golden by hand against the next three bullets before committing it.
    - `the fixture shows the expected system`. Node `(id, type, confidence)` triples include:
      - `package:apps/web/package.json` frontend inferred;
      - `package:apps/api/package.json` service observed, with aliases `['api']`;
      - `package:apps/worker/package.json` service observed;
      - `package:packages/db/package.json` module;
      - `compose:compose.yaml#db` datastore observed;
      - `compose:compose.yaml#cache` datastore observed;
      - `external:stripe` external-system inferred;
      - `queue:bullmq` queue inferred.

      `examples/demo` has `outsideWorkspace: true`. There is no node `datastore:postgresql`, because it merged into `compose:compose.yaml#db`.
    - Edges include:
      - `depends-on:package:packages/db/package.json->compose:compose.yaml#db` (inferred, reasons include `client-library:pg` and `prisma-datasource`);
      - `depends-on:package:apps/api/package.json->compose:compose.yaml#cache` (observed, `compose-depends-on`);
      - `dependency:package:apps/api/package.json->package:packages/db/package.json`.
    - `diagnostics` equals `[]` and `gaps` equals `[]`.
    - `the golden contains no secret`: the serialized graph contains neither `secret` nor `DATABASE_URL`.
    - `two runs are byte-identical`.
    - `ambiguous compose resources draw no edge`: the fixture plus a second `analytics: postgres:16` service → node `datastore:postgresql` exists; no edge from `packages/db` to either Compose database; diagnostic `Ambiguous resource: PostgreSQL (compose:compose.yaml#analytics, compose:compose.yaml#db)`.
    - `a failing analyzer keeps packages`: replace `dockerCompose` with a throwing analyzer of the same ID. All five package nodes are still present, `compose:` nodes are absent, and the diagnostic `Analyzer failed: docker-compose in <label>. Its findings were discarded.` is present.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run apps/cli`. Expected: FAIL.
- [ ] **Step 3: Implement** `architecture.ts` and update `graph.ts` and the callers' types. `apps/cli` and `packages/test-fixtures` gain dependencies on `@archwise/analyzers` (dev for test-fixtures, runtime for cli).
- [ ] **Step 4: Run** with `UPDATE_GOLDEN=1` once, review the JSON by hand, then run without it. Expected: PASS. Then run the full `vitest run`: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(application): resolve facts into view graph v2"`

### Task 9: Revision mapping for discovered kinds

**Files:**
- Modify: `apps/cli/src/revision.ts`, `apps/cli/src/store-runtime.ts` (pass `analysis`), `apps/cli/src/inventory-output.ts` (`scanRecord` analyzers list)
- Test: `apps/cli/tests/revision.test.ts`, `apps/cli/tests/system-fixture.test.ts` (the revision golden), `apps/cli/tests/compat.test.ts`

**Interfaces:**
- Consumes: `ArchitectureGraph` v2 (Task 8) and `AnalysisResult` (Task 2).
- Produces:
  - `buildGraphRevision(graph, scan, ids, analysis: Pick<AnalysisResult, 'coverage' | 'failures'> = EMPTY_ANALYSIS): GraphRevision`;
  - `scanRecord(result, startedAt, finishedAt, analyzers: readonly { id: string; version: string }[])`;
  - `prepareStore` options gain `analysis`.

**Rules:**
- **Node kinds and ID prefixes:**

  | View type | Kind | Prefix |
  |---|---|---|
  | frontend | `frontend` | `fe-` |
  | service | `service` | `svc-` |
  | module | `module` | `mod-` |
  | datastore | `datastore` | `ds-` |
  | queue | `queue` | `q-` |
  | external-system | `external-system` | `ext-` |

  - The key for package nodes is today's `keyOf(owned)`, so a module keeps its exact ID.
  - The key for other nodes is the view node ID.
  - `repositoryId`: the package's owner. Compose nodes belong to the repository of their file, recovered from evidence path ownership through `scan.repositories` (longest `path` prefix within the same root). Technology nodes get `null`.
  - `confidence.reasons` = the view node's `reasons`.
- **Evidence IDs:**
  - `package-manifest` and `package-dependency` keep today's formula exactly.
  - Other evidence: `ev-` + `shortHash(<analyzer>:<kind>:<keyPath>:<start>-<end>|null)`, where `keyPath` follows the same single- or multi-root rule as `keyOf`.
  - `analyzerId` and `analyzerVersion` come from `analysis.coverage`, falling back to `MANIFEST_ANALYZER` for `node-manifest`.
- **Edges:** `dep-shortHash(edge.id)` for every edge, as today. The kind comes from the view type.
- **Coverage:** the `node-manifest` rows as today, plus every `analysis.coverage` row. The status mapping is identity.
- **Status:** `partial` when diagnostics are non-empty, the scan is truncated, a repository was unreached, or any analyzer failed. Gaps never count.
- **Diagnostics:** the warning codes as today, plus:
  - prefix `Ambiguous resource` → `ambiguous-resource`;
  - prefix `Analyzer failed` → `analyzer-failed`.

  Gaps add `info` diagnostics, one per code, with id `diag-<code>`:

  | Gap reason | Code |
  |---|---|
  | `unsupported` | `unsupported-input` |
  | `invalid-syntax` | `invalid-syntax` |
  | `unmatched-build-context` | `unmatched-build-context` |
  | `unidentified-datastore` | `unidentified-datastore` |
  | `too-large`, `binary`, `unreadable`, `budget` | `input-skipped` |

  The references are `{ kind: 'evidence', id }` of gap evidence items: ruleId `gap:<reason>`, `lines: null`, the analyzer from the gap. At most `LIMITS.references`, in sorted order. Gap evidence is added to `evidence`.

  **Ruling:** the extra code `input-skipped`, because the spec's list has no code for budget or size gaps.
- **`scanRecord.analyzers`:** `node-manifest` plus every built-in analyzer `{ id, version }`, sorted by ID.

- [ ] **Step 1: Write the failing tests:**
  - `revision.test.ts`:
    - `a module keeps its Phase 3 revision id`: a package-only graph gives the same `mod-` IDs and evidence IDs as the existing expected values. The existing tests stay, adapted to v2 input.
    - `discovered kinds map to domain kinds and prefixes`, with a hand-built v2 graph of one node of each type.
    - `gaps are info diagnostics and keep the revision complete`: one `unsupported` gap → `status: 'complete'`, diagnostics `[{ id: 'diag-unsupported-input', severity: 'info', code: 'unsupported-input', references: [{ kind: 'evidence', id: <ev id> }] }]`.
    - `a failed analyzer makes the revision partial and is a failed coverage row`.
    - `every revision passes domain validation`, through the existing validate helper, for the system-fixture revision.
  - `system-fixture.test.ts`: `matches the golden revision` against `golden/system-fixture.revision.json`. Fixed `ids`: `revisionId 'rev-1'`, `workspaceId 'ws-1'`, parent `null` and `createdAt '2026-11-23T00:00:00.000Z'`. Assert `status: 'complete'`.
  - `compat.test.ts`: `a project without detectable infrastructure keeps its Phase 3 revision`. This is an existing Phase 3 fixture run through the new pipeline with `BUILTIN_ANALYZERS`. Node IDs, edge IDs, evidence IDs and status are equal to the pre-change values that the test file already pins. Only `coverage` gains rows.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run apps/cli`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** with `UPDATE_GOLDEN=1` for the revision golden, review it, then run normally. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(cli): map discovered kinds, gaps and analyzer coverage into revisions"`

### Task 10: CLI wiring and the outside-the-core analyzer

**Files:**
- Modify: `apps/cli/src/bin.ts`
- Create: `packages/test-fixtures/src/demo-analyzer.ts` (`demoAnalyzer: Analyzer`, which imports only types from `@archwise/application`)
- Modify: `packages/test-fixtures/package.json` (dependency `@archwise/application`)
- Modify: `.dependency-cruiser.mjs`, adding `demo-analyzer-uses-contract-only`: from `^packages/test-fixtures/src/demo-analyzer` to `pathNot: '^packages/(application|domain)/'`
- Test: `scripts/tests/cli-smoke.test.mjs`, `packages/test-fixtures/tests/demo-analyzer.test.ts`

**Interfaces:**
- Consumes: `BUILTIN_ANALYZERS`, `analyzerInputs`, `analysisInputs`, `runAnalyzers` and `buildArchitectureGraph(result, analysis)`.

**Rules:**
- `bin.ts` passes `inputs: analyzerInputs(BUILTIN_ANALYZERS)` to the scan.
- After the scan, it runs `runAnalyzers({ analyzers: BUILTIN_ANALYZERS, repositories: analysisInputs(result), signal: controller.signal })`. An abort during analysis exits 130 exactly like a scan cancel.
- `--graph` prints v2.
- The human summary appends one line per failure: `Warning: Analyzer failed: <id> in <label>. Its findings were discarded.` Since failures are diagnostics, this is already covered by printing `graph.diagnostics` that start with `Analyzer failed`.
- `--json` is unchanged.
- `demoAnalyzer`:
  - descriptor `{ id: 'demo-todo', version: '0.1.0', inputs: { fileNames: ['TODO.md'], extensions: [] }, budget: { timeMs: 1000, maxFiles: 10 } }`;
  - emits one `external-system` `resource` fact (`technology: 'todo'`, `label: 'TODO list'`, `inferred`) per `TODO.md`.

- [ ] **Step 1: Write the failing tests:**
  - `cli-smoke.test.mjs`: `--graph on the system fixture prints a version 2 graph with a frontend, a service and a datastore`. Write `SYSTEM_FIXTURE` to a temp dir (import from the built `@archwise/test-fixtures`), run the built CLI with `--path <dir> --graph`, parse stdout, and assert:
    - `version === 2`;
    - `nodes.some(n => n.type === 'frontend')`;
    - `nodes.some(n => n.id === 'compose:compose.yaml#db')`;
    - stdout does not include `secret`.
  - `cli-smoke.test.mjs`: `--json output on the system fixture has no files or contents`. Assert `!('files' in parsed)` and that stdout does not include `secret`.
  - `demo-analyzer.test.ts`: `an analyzer outside the core runs through the public contract`. `runAnalyzers({ analyzers: [demoAnalyzer], repositories: [{ repository: { id: 'r', label: 'r' }, files: [{ path: 'TODO.md', text: '- x', problem: null }], packages: [] }] })` → one fact, coverage `complete`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 build && node --test scripts/tests/*.test.mjs` and `npx --yes pnpm@10.34.9 vitest run packages/test-fixtures`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same commands plus `npx --yes pnpm@10.34.9 boundaries`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(cli): run built-in analyzers; demo analyzer proves the public contract"`

### Task 11: Studio graph v2, upgrade and System view logic

**Files:**
- Modify: `apps/web/src/graph-types.ts` (v2 types, `isGraph` for v2, `upgradeGraph`)
- Modify: `apps/web/src/session-view.ts` (use `upgradeGraph`)
- Create: `apps/web/src/system-view.ts`
- Modify: `apps/web/src/scan-summary.ts`. `nodeDisplayLabel` stays; add `gapLines(gaps): string[]`.
- Test: `apps/web/src/graph-types.test.ts`, `apps/web/src/session-view.test.ts`, `apps/web/src/system-view.test.ts`, `apps/web/src/scan-summary.test.ts`

**Interfaces:**
- Consumes: the v2 JSON shape (Task 8).
- Produces:

```ts
// graph-types.ts: Graph/GraphNode/GraphEdge mirror ArchitectureGraph v2 (browser-side copy; no import from application)
export function isGraph(value: unknown): value is Graph;           // version 2 only
export function upgradeGraph(value: unknown): Graph | null;        // v2 → validated as-is; v1 → converted; else null
// system-view.ts
export type StudioView = 'system' | 'all';
export function systemGraph(graph: Graph): Graph;                  // filtered + lifted
export function initialView(graph: Graph): StudioView;             // 'system' unless systemGraph(graph).nodes.length === 0
export function graphForView(graph: Graph, view: StudioView): Graph;
// scan-summary.ts
export function gapLines(gaps: Graph['gaps']): string[];           // grouped: "Not analyzed (unsupported): nx.json, apps/web/project.json"
```

**Rules:**
- **The v1 → v2 conversion** maps:
  - `type: 'package'` → `'module'`;
  - `framework` → `technology`;
  - `type: 'declared-dependency'` → `'depends-on'`;
  - confidence `observed`;
  - reasons: `['manifest-declared']` for nodes, `['dependency-declared']` for edges;
  - `outsideWorkspace: false` and `aliases: []`;
  - for evidence, `lines: null` and `analyzer: 'node-manifest'`;
  - `gaps: []`.

  IDs, labels, `repository`, diagnostics and `inspectedEntries` are unchanged.
- **`systemGraph` visibility:** a node is visible when `type !== 'module'` and `!outsideWorkspace`. Hidden nodes are modules and outside-workspace packages of any type.
- **Edges:** an edge between two visible nodes is kept. For each visible node V, walk outgoing edges through hidden nodes only, depth-first in edge-ID order, without revisiting. Every edge from a hidden node H to a visible T (T ≠ V) yields a lifted edge, unless an edge V→T already exists:
  - `id: 'lifted:<V>-><T>'`, type = the underlying edge's type;
  - `confidence: 'inferred'`;
  - `reasons: ['via ' + hidden labels on the path joined by ', ']`, using the first path found;
  - `evidence` = the underlying edge's evidence;
  - one lifted edge per (V, T).
- **`gapLines`:** groups by reason in `GAP_REASONS` order, with paths sorted.

- [ ] **Step 1: Write the failing tests:**
  - `graph-types.test.ts`:
    - `accepts a v2 graph`; `rejects v1 in isGraph`;
    - `upgradeGraph converts a stored Phase 3 view with identical ids`: take the existing v1 fixture from the current tests. Expect `upgradeGraph(v1)!.nodes.map(n => n.id)` to equal the v1 IDs, `nodes[0].type === 'module'`, and `projectSignature(upgradeGraph(v1)!)` to equal `projectSignature` computed by the v1-era formula on the same IDs and paths. The formula uses only IDs and evidence paths, so assert equality against the literal signature string that the current `sandbox-persistence.test.ts` example produces.
    - `upgradeGraph rejects garbage` → `null`.
  - `session-view.test.ts`: `a stored v1 view is shown historically after upgrade`. `chooseWorkspaceGraph({ baseIsCurrent: false, view: v1 }, currentV2)` → `historical: true`, and the graph IDs equal the v1 IDs.
  - `system-view.test.ts`:
    - `hides modules and outside-workspace packages`.
    - `lifts through a library chain once`: `api → core → db → PostgreSQL`, where `core` and `db` are modules → exactly one edge `lifted:api->pg` with reasons `['via core, db']`.
    - `does not duplicate a direct edge`: plus a direct `api → pg` → no lifted edge.
    - `initialView falls back to all when nothing is visible`: a modules-only graph → `'all'`.
    - `graphForView('all')` returns the graph unchanged.
  - `scan-summary.test.ts`: `gapLines groups by reason` → `['Not analyzed (unsupported): apps/web/project.json, nx.json', 'Not analyzed (invalid-syntax): compose.yaml']`.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 vitest run apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.** `App.svelte` replaces `isGraph(payload)` with `upgradeGraph(payload)` (null → the existing "Unsupported graph format." error), so typecheck stays green.
- [ ] **Step 4: Run** `npx --yes pnpm@10.34.9 vitest run apps/web && npx --yes pnpm@10.34.9 typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(web): graph v2, v1 upgrade and System view lifting"`

### Task 12: Studio UI: view switch, discovered nodes, inspector and gaps; browser smoke

**Files:**
- Create: `apps/web/src/DiscoveredNode.svelte`
- Modify: `apps/web/src/ArchitectureCanvas.svelte` (discovered nodes use `type: 'discovered'` registered in `nodeTypes`; inferred edges dashed)
- Modify: `apps/web/src/App.svelte` (view switch, inspector, gaps in the scan panel, filter on `technology`)
- Modify: `apps/web/src/studio.css`
- Modify: `scripts/browser-smoke.mjs` (a system-fixture phase)
- Test: `scripts/browser-smoke.mjs`, run manually in real Chrome as in Phase 3; `apps/web` unit tests stay green

**Interfaces:**
- Consumes: `graphForView`, `initialView`, `gapLines` and `nodeDisplayLabel` (Task 11).

**UI rules:**
- **The header** gets a segmented control `System | All packages` (`aria-label="Graph view"`), defaulting to `initialView(graph)`. When `initialView` returns `all` because nothing was found, a one-line notice under the header reads: `No frontends, services or infrastructure were recognized; showing all packages.`
- **Canvas:** `graphForView(graph, view)` feeds the canvas, the filter and the visible IDs.
- **Node symbols:**

  | Type | Symbol |
  |---|---|
  | frontend | ◧ |
  | service | ▣ |
  | module | ▢ |
  | datastore | ▤ |
  | queue | ☷ |
  | external-system | ◎ |
  | job | ⏱ |

  - The subtitle is `<Kind label> · <technology>`. Kind labels: Frontend, Service, Library, Datastore, Queue, External service, Job.
  - `inferred` nodes get the class `inferred` (dashed border) and the subtitle suffix ` · inferred`.
- **Inferred edges** have `style: 'stroke-dasharray: 6 4'`.
- **Inspector** for a discovered node:
  - heading: the label;
  - `Kind: <Kind label>`;
  - `Technology: <technology ?? 'Not identified'>`;
  - `Confidence: observed|inferred`, followed by its reasons as a list;
  - `Compose services: …` when there are aliases;
  - `Repository: …` as today;
  - `Evidence` list items `path` or `path:start`, then ` — <analyzer> / <kind>`;
  - `Outgoing relations: N`.
- **The scan summary panel** appends the `gapLines(graph.gaps)` lines under a heading `Not analyzed` when non-empty, plus the diagnostics starting with `Analyzer failed`.
- The side hint text becomes `Discovered relations are evidence-based, not measured runtime calls.`

- [ ] **Step 1: Extend `scripts/browser-smoke.mjs`** with a phase that writes `SYSTEM_FIXTURE` to a temp dir, starts the built CLI with `--serve --no-open --no-store`, opens the session URL and asserts:
  - the `Graph view` control shows `System` pressed;
  - nodes with text `web`, `api`, `worker`, `db` (the Compose datastore) and `Stripe` are visible;
  - no node with text `@shop/db` is visible in System view; after clicking `All packages`, `@shop/db` is visible;
  - clicking the `api` node shows `Kind: Service` and `Compose services: api` in the inspector.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 build && node scripts/browser-smoke.mjs`, with Playwright reinstalled at `<scratchpad>/pw` as in Phase 3 if missing. Expected: FAIL at the `Graph view` assertion.
- [ ] **Step 3: Implement** the UI.
- [ ] **Step 4: Run** the smoke again with `ARCHWISE_SMOKE_SCREENSHOT=<scratchpad>/system.png`, and look at the screenshot. Expected: PASS, and the screenshot shows the System view with distinct node kinds. Then run `npx --yes pnpm@10.34.9 check`: PASS.
- [ ] **Step 5: Commit.** `git commit -s -m "feat(web): System view, discovered node kinds, evidence inspector and gaps"`

### Task 13: Documentation and release notes

**Files:**
- Modify: `docs/discovery.md`. Add an "Analyzers" section covering:
  - the contract;
  - the built-ins with versions and inputs;
  - catalogs (point to `packages/analyzers/src/catalog.ts`);
  - identity and merging rules;
  - gaps and their codes;
  - the deny list;
  - Compose override files as unsupported.
- Modify: `docs/security.md`: the files analyzers may read, the deny list, and what is never stored (Compose environment, commands, Prisma URL).
- Modify: `docs/sessions.md`: v1 views upgrade on read; projects that gain nodes or evidence show "architecture changed"; Sandbox exports of such projects stop matching.
- Modify: `docs/architecture.md` (the `packages/analyzers` box and dependency direction), `AGENTS.md` (add `packages/analyzers` to the boundary diagram) and the package READMEs (`analyzers`, `application`, `cli`, `web` if it has one).
- Modify: `docs/implementation-roadmap.md`: Phase 4 "In progress (PR 1 of 3 merged)", once merged, with a dated snapshot.
- Modify: `docs/alpha-testing.md` if it describes the graph contents.
- Create: `.changeset/<name>.md`, a minor bump for `@archwise/cli`. The text mentions:
  - the System view;
  - `--graph` version 2;
  - the "architecture changed" notice for projects gaining nodes;
  - Sandbox export signature changes;
  - a revision with a `frontend` node not importing into older Archwise.

- [ ] **Step 1: Write the docs.** Every behaviour statement must match the code and the tests. Grep every doc for `version: 1` view-graph mentions, `framework`, `declared-dependency` and `package` node type, and update them.
- [ ] **Step 2: Run** `npx --yes pnpm@10.34.9 check`. Expected: PASS.
- [ ] **Step 3: Commit.** `git commit -s -m "docs: analyzers, security boundary, sessions compatibility and roadmap for Phase 4 PR 1"`
