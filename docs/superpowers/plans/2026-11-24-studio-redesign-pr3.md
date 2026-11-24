# Studio Redesign PR 3 (Comprehension) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For any component, a person can answer three questions without leaving the Studio: what is it, what does it relate to, and why Archwise thinks so. This PR delivers:
- **Readable reasons.** Every reason code is shown as a sentence, with its file and line.
- **A fixed inspector.** A text-only header, a confidence band, and the Details, Relations and Evidence tabs.
- **Summary lines** that state only claims.
- **Relation wording** taken from the relation's kind.
- **Indirect relations** that carry their full chain of steps.
- **Labelled counters** that also act as filters.
- **External-system categories,** so Stripe is drawn as the payments terminal.
- **Stored Compose properties:** a closed allowlist of values, masked.
- **Bounded, masked evidence excerpts.**

**Architecture:**
- **Data, bottom-up.** Each layer gains only what the screens need.
  - The analyzers add categories, Compose line ranges and Compose properties.
  - The resolver passes those through as optional view-graph fields and exports the closed list of reason-code families.
  - The CLI server indexes the evidence of the latest scan, decorates the served graph with `excerptId`s and serves bounded excerpts.
- **The Studio.** Pure modules hold the rules: `reason-catalog.ts`, `claims.ts`, the indirect-relation code in `system-view.ts`, and `counters.ts`. They are unit-tested. A new `Inspector.svelte` renders those modules' output, and so do the list and the canvas labels.

**Tech Stack:**
- TypeScript, Node `node:crypto`, `node:fs/promises` and `TextDecoder`;
- `yaml` with `LineCounter`, already a dependency (ADR 0007);
- Svelte 5.57, `@xyflow/svelte` 1.7.1 with `EdgeLabel`;
- Vitest, `@testing-library/svelte` and the Playwright smoke.

There are **no new runtime dependencies**. `@archwise/application: workspace:*` becomes a **devDependency** of `@archwise/web`, for one completeness test. The boundaries check excludes test files.

**Spec:** `docs/superpowers/specs/2026-11-23-studio-redesign-design.md`. The relevant sections:
- §5 comprehension rules (all of it), §6 model changes, §9 verification, §10 slice 3;
- §12.1 rulings 1, 2, 5, 6 and 8, and §12.2 (owner option A).

The glossary is `CONTEXT.md`, and user-facing words follow it.

## Global Constraints

- **Confidence words:** Observed, Inferred, Unknown. Never "Confirmed" and never "Deduced" in UI text (§5.1).
- **Band copy, verbatim:**
  - "Observed because: …"
  - "Inferred because: …", followed by "No file states this directly. Check before relying on it."
- **Empty inspector, verbatim:** "Select a component on the canvas or in the list to see what it is, what it relates to, and why."
- **Earlier-scan evidence, verbatim:** "Not available: this evidence is from an earlier scan."
- **One meaning per visual dimension.**
  - Kind is shown by fill and piece.
  - Confidence is shown by line style: solid for Observed, dashed (`6 5`) for Inferred, dotted (`1 4`, round caps) for Unknown. Reasons are always in neutral ink, prefixed with the level word.
  - `--accent` marks selection, focus, the active tab and the active filter only.
  - Filters dim and add no colour.
- **Relation wording (§5.7):**
  - `depends-on` → "depends on"
  - `calls` → "calls"
  - `publishes` → "publishes to"
  - `consumes` → "consumes from"
  - `reads` → "reads"
  - `writes` → "writes"
- **Compose property allowlist:** `image`, `build`, `ports` and `depends_on`.
  - Never `environment`, `env_file`, `command`, `entrypoint`, `labels`, `secrets` or `configs`.
  - For `ports`, only the host and container numbers are kept.
- **External-system categories:** `payments`, `email`, `storage`, `auth`, `ai`, `monitoring` and `other`.
- **Excerpts:**
  - at most 40 lines;
  - keyed by an evidence identifier from the latest scan, never by a raw path;
  - deny list enforced, files under the inventory's `bytesPerFile` only, valid UTF-8 only;
  - masked;
  - sent with `Cache-Control: no-store`, never logged, stored or exported.
- **Untrusted text:** labels, paths, values and excerpt lines are rendered as text only. Never use `{@html}`.
- **Colours:** literal colours live in `apps/web/src/styles/tokens.css` only. A guard test enforces this.
- **View graph:** stays `version: 2`, and only optional fields are added. `archwise.graph` v1 is unchanged.
- **Commits:** signed off (`git commit -s`), with identity André Oliveira <coliveira.andre@gmail.com>. Each commit ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Tooling:**
  - Use `npx --yes pnpm@10.34.9`.
  - Vitest commands end with `< /dev/null`.
  - Never run Prettier on `docs/`.
- **Branch:** `feat/studio-redesign-pr3`, cut from `main` at `e8399ff` or later.

## Review Focus

1. **Multi-root workspaces.** Two repositories each have `package.json` at their root. Each component's Show lines must read its own repository's file, never the other one. If the server cannot tell which root an evidence item belongs to, it gives that item no `excerptId`, so the Studio never shows lines from the wrong repository. *(Task 3: `excerpt index picks the node's own root in multi-root workspaces`.)*
2. **Diamond dependencies through hidden libraries.** For example, api → a → db and api → b → db, where a's step is Observed and b's is Inferred. The relation must use the all-Observed chain, list the other one under "Also through …", and appear once, never twice. *(Task 6: `prefers the chain with fewer inferred steps and lists the other`.)*
3. **A resumed historical session** whose stored graph has no `excerptId`s. Evidence still present in the latest scan offers Show lines. Evidence missing from it shows the earlier-scan copy and never errors. *(Task 7: `historical evidence maps to the latest scan's excerpt id or says it is unavailable`.)*
4. **Over-masking versus leaking.** A Compose `image: registry.example.com/app:${TAG}` must survive unchanged. A `postgres://user:pass@db:5432/x` must lose `user:pass`, and a line `password: hunter2` must lose `hunter2`. *(Task 2: `maskConfigValue keeps images and masks credentials`.)*
5. **A reason code the catalog does not know,** such as `via @shop/db` from a Phase 4 PR 1 session or a future code. It renders as the raw code, never as an empty line, and never crashes the band. *(Task 4: `unknown codes render as the raw code`.)*

---

### Task 1: Reason-code families and external-system categories

**Files:**
- Create: `packages/application/src/reason-codes.ts`
- Modify:
  - `packages/application/src/index.ts`;
  - `packages/application/src/analyzer.ts`: the `resource` fact gains an optional `category`, and `isFact` accepts it;
  - `packages/application/src/architecture.ts`: `ArchitectureNode.category?`;
  - `packages/analyzers/src/catalog.ts`;
  - `packages/analyzers/src/node-roles.ts`: emits `category` on external `resource` facts;
  - `packages/analyzers/package.json` (if the version is pinned) and `node-roles` `descriptor.version` → `1.1.0`.
- Test:
  - `packages/analyzers/tests/node-roles.test.ts`;
  - `apps/cli/tests/graph.test.ts`;
  - `packages/application/tests/run-analyzers.test.ts`, for `isFact`.

**Interfaces:**
- Produces:
  - `REASON_CODE_FAMILIES: readonly ['client-library', 'compose-build', 'compose-depends-on', 'compose-image', 'compose-service', 'dependency-declared', 'framework-dependency', 'manifest-declared', 'prisma-datasource']`;
  - `type ReasonCodeFamily`;
  - `reasonFamily(code: string): string`, which returns the text before the first `:`;
  - `EXTERNAL_CATEGORIES = ['payments', 'email', 'storage', 'auth', 'ai', 'monitoring', 'other'] as const`;
  - `type ExternalCategory`;
  - `ArchitectureNode.category?: ExternalCategory`, present only on `external-system` nodes;
  - `LibraryEntry.category?: ExternalCategory`.

- [ ] **Step 1: Write the failing tests.**
  - In `graph.test.ts`, add a test named `every reason the resolver emits belongs to a declared family`. Resolve the fullest existing fixture: the system fixture plus a Compose project with a build service, a catalogued image (`postgres`), an uncatalogued image (`nginx`, giving `compose-service`) and `depends_on`, plus Prisma, plus a package with `pg` and no Compose (giving the `client-library` node reason). Collect every node and edge reason, and assert `REASON_CODE_FAMILIES.includes(reasonFamily(code))` for each one. Assert also that the set of families seen equals `REASON_CODE_FAMILIES`, so the list carries no dead codes.
  - In the same file, add a test named `external nodes carry their catalog category`. A package depending on `stripe` and `@sentry/node` yields `external:stripe` with `category: 'payments'` and `external:sentry` with `category: 'monitoring'`. Non-external nodes have no `category` key.
  - In `node-roles.test.ts`, add a test named `every external catalog entry has a category`. Every `LIBRARY_CATALOG` entry with kind `external-system` has a category in `EXTERNAL_CATEGORIES`, and no other kind has one. Pin this mapping:
    - stripe → payments;
    - sendgrid, resend → email;
    - s3 → storage;
    - firebase, twilio, slack → other;
    - sentry → monitoring;
    - openai, anthropic → ai.
  - Add an `isFact` test. It accepts a `resource` fact with `category: 'payments'`, and with no `category` key. It rejects `category: 'banking'`, and rejects a category on a `datastore` resource.
- [ ] **Step 2: Run them and see them fail.**
  Run: `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 exec vitest run apps/cli/tests/graph.test.ts packages/analyzers/tests/node-roles.test.ts packages/application/tests/run-analyzers.test.ts < /dev/null`
  Expected: FAIL. `REASON_CODE_FAMILIES` is not exported, and `category` is undefined.
- [ ] **Step 3: Implement.**
  - `reason-codes.ts` is pure and imports nothing.
  - `ResourceEntry` keeps its shape. `entries()` takes an optional category for external entries.
  - The resolver copies `fact.category` onto the technology node it creates (`technologyNode`). If several facts for the same technology disagree, the first one in sorted fact order wins.
- [ ] **Step 4: Run the tests and see them pass.** Run the Step 2 command. Expected: PASS.
- [ ] **Step 5: Run the affected suites and commit.**
  Run: `npx --yes pnpm@10.34.9 exec vitest run packages apps/cli < /dev/null`
  Expected: PASS. Update `apps/cli/tests/golden/system-fixture.graph.json` only if the fixture has an external system, and review that diff by eye.
  Commit: `feat(analyzers): external-system categories and the closed reason-code families`.

### Task 2: Masking, Compose line evidence and stored Compose properties

**Files:**
- Modify:
  - `packages/domain/src/primitives.ts`: add `maskConfigValue`;
  - `packages/analyzers/src/yaml.ts`: add `parseYamlWithLines`;
  - `packages/analyzers/src/docker-compose.ts`: line evidence, `compose-property` facts, version `1.1.0`;
  - `packages/application/src/analyzer.ts`: the new fact type and its `isFact` case;
  - `packages/application/src/architecture.ts`: `ArchitectureNode.properties?`.
- Test:
  - `packages/domain/tests/primitives.test.ts`;
  - `packages/analyzers/tests/docker-compose.test.ts`;
  - `apps/cli/tests/graph.test.ts`;
  - the goldens.

**Interfaces:**
- Produces:
  - `maskConfigValue(value: string): string`, in `@archwise/domain`;
  - the fact `{ type: 'compose-property'; compose: ComposeRef; name: ComposePropertyName; value: string; evidence: FactEvidence[] }`;
  - `COMPOSE_PROPERTY_NAMES = ['image', 'build', 'ports', 'depends_on'] as const`, from `@archwise/application`;
  - `ArchitectureNode.properties?: readonly { name: ComposePropertyName; value: string; evidence: ViewEvidence }[]`. It is in allowlist order and only present when the list is not empty.

- [ ] **Step 1: Write the failing tests.**
  - `primitives.test.ts`: add `maskConfigValue keeps images and masks credentials`. The expected values are:

    | Input | Expected |
    |---|---|
    | `'registry.example.com/app:${TAG}'` | unchanged |
    | `'postgres://user:pass@db:5432/x'` | `'postgres://[redacted]@db:5432/x'` |
    | `'password: hunter2'` | `'password: [redacted]'` |
    | `'API_TOKEN=abc'` | `'API_TOKEN=[redacted]'` |
    | `'"secretKey": "x"'` | `'"secretKey": [redacted]'` |
    | `'8080:80'` | unchanged |
    | an `sk-…` key | redacted, as `redactSensitiveText` does today |

    The function applies `redactSensitiveText`, then credentials in URLs (`scheme://user:pass@`), then the value after `:` or `=` for keys whose name contains `password`, `passwd`, `secret`, `token` or `key`, case-insensitive. The masked value runs to the end of the line, or to the closing quote of a quoted value.
  - `docker-compose.test.ts`: add `emits allowlisted properties with line evidence`. Use this Compose file, with the line numbers as written:

    ```yaml
    services:            # 1
      api:               # 2
        build: ./apps/api   # 3
        ports:           # 4
          - "127.0.0.1:8080:80/tcp"  # 5
          - target: 9090 # 6
            published: 9091  # 7
        depends_on: [db] # 8
        environment:     # 9
          DB_PASSWORD: s3cret  # 10
        command: ["node", "x"] # 11
      db:                # 12
        image: postgres:16  # 13
    ```

    Expect exactly these `compose-property` facts:
    - api `build` = `./apps/api`, lines 3–3;
    - api `ports` = `8080:80, 9091:9090`, lines 4–7;
    - api `depends_on` = `db`, lines 8–8;
    - db `image` = `postgres:16`, lines 13–13.

    Assert also:
    - no fact value contains `s3cret`, `node` or `environment`;
    - every existing evidence item now has lines: `compose-build`, `compose-image` and `compose-service` carry the service's own range (api 2–11, db 12–13), and `compose-depends-on` carries line 8.
  - Add a test named `ports keep numbers only`. `"3000"` gives `3000`. `"${PORT}:80"` gives `80`, with the interpolated host dropped. `{ target: 80 }` gives `80`.
  - `graph.test.ts`: add `compose properties attach to the resolved component, masked`.
    - A built service linked to `@shop/api` puts its `build`, `ports` and `depends_on` properties on `package:apps/api/package.json`.
    - An image service puts `image` on its compose node.
    - An `image: postgres://u:p@x` value comes out masked.
    - Each property's evidence is a `ViewEvidence` with `kind: 'compose-property'` and lines.
  - Add an `isFact` test for `compose-property`: it is accepted with an allowlisted name, and rejected with `name: 'environment'`.
- [ ] **Step 2: Run them and see them fail.**
  Run: `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 exec vitest run packages/domain packages/analyzers/tests/docker-compose.test.ts apps/cli/tests/graph.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - `parseYamlWithLines(text)` returns `{ ok: true, value, lines(path: (string | number)[]): { start: number; end: number } | null } | { ok: false }`.
    - It keeps `parseYaml`'s options and validation, and adds `lineCounter`.
    - `lines` uses `document.getIn(path, true)` for a value's range, or the pair from the parent map's `items` when the key's own line is needed.
    - A range ends on the last line that holds content: trailing newlines do not count.
  - A property's range runs from its key line to the end of its value.
  - The analyzer reads only the four allowlisted keys. It never calls `lines()` or reads values for other keys.
  - The resolver attaches each property through `composeTargets`, after all Compose facts are collected. It applies `maskConfigValue` again as defence in depth.
- [ ] **Step 4: Run the Step 2 command and see it pass.**
- [ ] **Step 5: Regenerate the goldens and run the affected suites.**
  - Regenerate the goldens with the existing update path in `system-fixture.test.ts`, then read the diff. Only line ranges and `properties` may change.
  - Run: `npx --yes pnpm@10.34.9 exec vitest run packages apps/cli < /dev/null`. Expected: PASS.
  - Commit: `feat(compose): line evidence and stored allowlisted properties, masked`.

### Task 3: Evidence excerpts in the local server, ADR 0008 and the security docs

**Files:**
- Create:
  - `apps/cli/src/excerpts.ts`;
  - `apps/cli/tests/excerpts.test.ts`;
  - `docs/decisions/0008-excerpts-and-stored-config-values.md`.
- Modify:
  - `apps/cli/src/local-server.ts`: an `excerpts` option, the route, and decoration of `/api/v1/graph`;
  - `apps/cli/src/bin.ts`;
  - `apps/cli/tests/local-server.test.ts`;
  - `docs/security.md`;
  - `docs/architecture.md`, the API section.

**Interfaces:**
- Consumes:
  - `maskConfigValue` (Task 2);
  - `isDeniedInput` from `@archwise/discovery`;
  - `InventoryResult` (manifests have `sha256`; analyzer files have `text`);
  - the inventory's `bytesPerFile` budget, read from the same default the CLI passes to the inventory.
- Produces:
  - `interface ExcerptIndex { decorate(graph: ArchitectureGraph): ArchitectureGraph; lookup(id: string): ExcerptEntry | undefined }`;
  - `buildExcerptIndex(graph: ArchitectureGraph, inventory: InventoryResult): ExcerptIndex`;
  - `readExcerpt(entry: ExcerptEntry, limits: { bytesPerFile: number }): Promise<ExcerptResult>`;
  - `ExcerptResult`, which is one of:
    - `{ status: 'ok'; path: string; start: number; end: number; lines: string[] }`;
    - `{ status: 'changed' }`;
    - `{ status: 'unavailable'; reason: 'denied' | 'outside-root' | 'too-long' | 'too-large' | 'not-utf8' | 'unreadable' }`.
  - The served graph's evidence items gain `excerptId?: string` (64 hex characters).
  - **Route:** `GET /api/v1/evidence/excerpt/<id>`.
    - 200 with the `ExcerptResult` for `ok` and `changed`.
    - 422 with the result for `unavailable`.
    - 404 `{ error: 'Not found' }` for an unknown or malformed id.

- [ ] **Step 1: Write the failing tests in `excerpts.test.ts`.** Use real temporary directories (`mkdtemp`). Name them after spec §9:
  - `allowed evidence returns the cited lines, masked`. A Compose file cites lines 2–4 that contain `password: x`. The result is `ok`, with three lines, and the password is `[redacted]`.
  - `whole-file evidence returns its first 40 lines`. A 100-line `package.json` with `lines: null` returns lines 1–40.
  - `unknown evidence id is not found`. `lookup('0'.repeat(64))` is `undefined`, and the route returns 404.
  - `path outside the root is refused`. An entry whose path is `../x` is `unavailable`/`outside-root`. The index never creates such an entry, so build the entry directly.
  - `symlink escape is refused`. `apps/api/package.json` is a symlink to a file outside the root, giving `outside-root`. Rule: **any** symlink segment between the root and the file is refused.
  - `denied file is refused`. An entry for `.env` gives `denied`.
  - `over-long range is refused`. Lines 1–41 give `too-long`, and lines 1–40 are allowed.
  - `non-UTF-8 file is refused`. Bytes `0xff 0xfe` give `not-utf8`.
  - `file over the size limit is refused`. `bytesPerFile: 10` gives `too-large`.
  - `changed file shows the notice`. After the scan, the file's bytes change; its sha256 differs from the scan's, which gives `changed`.
  - `excerpt index picks the node's own root in multi-root workspaces`. Two roots each have `package.json` with different content. Each node's manifest evidence gets a distinct `excerptId`, and each id reads its own file.
  - `ambiguous evidence gets no excerpt id`. A technology node's `client-library` evidence path exists in two roots, so the decorated evidence has no `excerptId`.
  - `ids are deterministic`. Building the index twice gives the same ids. Each id is the sha256 hex of `${absoluteRoot}\0${path}\0${kind}\0${start ?? ''}-${end ?? ''}`.
  - In `local-server.test.ts`: `excerpt route requires the session, sets no-store and refuses query strings`, and `served graph carries excerpt ids; the stored graph does not`. The second test checks that the graph handed to the session store has no `excerptId` key.
- [ ] **Step 2: Run them and see them fail.**
  Run: `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 exec vitest run apps/cli/tests/excerpts.test.ts apps/cli/tests/local-server.test.ts < /dev/null`
  Expected: FAIL. The `excerpts.js` module is missing.
- [ ] **Step 3: Implement.**
  - **Root resolution.** For a node's evidence, the root is the node's repository root (`repository.id` → inventory repository → `rootId` → `roots[index]`), or the only root in a single-root workspace. For an edge's evidence, it is the source node's root. If that root does not hold the path among its manifests or analyzer files, or if no root is known and the path exists in several roots, the item gets no id.
  - **Scan hash.** For a manifest, it is `manifest.sha256`. For an analyzer file, it is the sha256 of `file.text` as UTF-8. A file with neither gets no id.
  - **Read order:**
    1. Refuse `..` and absolute paths.
    2. Run `isDeniedInput`.
    3. `lstat` each segment from the root, refusing symlinks.
    4. Check the size against `bytesPerFile`.
    5. Read the bytes.
    6. Compare the sha256 with the scan hash.
    7. Decode as UTF-8 with `fatal: true`.
    8. Check the range against the 40-line limit.
    9. Slice the lines.
    10. Apply `maskConfigValue` to each line.
  - **Never cached, never logged.** Nothing is kept between requests. Failures return the result and log nothing.
  - **Route.** The route matches `^/api/v1/evidence/excerpt/([0-9a-f]{64})$`. The existing "Query parameters not supported" rule stays.
  - **Ruling for the ledger:** the spec names the endpoint `GET /api/v1/evidence/excerpt`, keyed by an evidence identifier. The id travels as a path segment because the server refuses query strings.
- [ ] **Step 4: Run the Step 2 command and see it pass.**
- [ ] **Step 5: Write ADR 0008 and update the security docs.**
  - Write `docs/decisions/0008-excerpts-and-stored-config-values.md` in the format of ADRs 0006 and 0007: Status, Context, Decision, Consequences, and Alternatives, including reading properties live at request time and why it was rejected. It covers:
    - the excerpt boundary (§5.11);
    - stored Compose properties (§12.2), with the allowlist and the masking rules.
  - In `docs/security.md`:
    - replace "file contents never reach the graph, the store or the API" with the §12.2 sentence, verbatim: "The graph stores only this closed list of configuration values, masked. It never stores environment variables, commands or source content.";
    - add an "Evidence excerpts" section that lists every check, in the order of Step 3.
- [ ] **Step 6: Run the CLI suite and commit.**
  Run: `npx --yes pnpm@10.34.9 exec vitest run apps/cli < /dev/null`
  Expected: PASS.
  Commit: `feat(cli): bounded, masked evidence excerpts keyed by evidence id (ADR 0008)`.

### Task 4: Web contract fields and the reason catalog

**Files:**
- Create:
  - `apps/web/src/reason-catalog.ts`;
  - `apps/web/src/reason-catalog.test.ts`.
- Modify:
  - `apps/web/src/graph-types.ts`;
  - `apps/web/src/graph-types.test.ts`;
  - `apps/web/package.json`: add the devDependency `"@archwise/application": "workspace:*"`, then run `npx --yes pnpm@10.34.9 install`.

**Interfaces:**
- Produces:
  - In `graph-types.ts`:
    - `GraphNode.category?: string`;
    - `GraphNode.properties?: readonly GraphProperty[]`, where `GraphProperty = { name: string; value: string; evidence: GraphEvidence }`;
    - `GraphEvidence.excerptId?: string`.

    Validation accepts these fields when they are absent or well-formed. A malformed value rejects the graph.
  - `type SentencePart = { text: string; strong?: true }`.
  - `interface ReasonView { code: string; parts: SentencePart[]; file: string | null; known: boolean }`, where `file` reads like `"apps/api/package.json"` or `"compose.yaml · line 14"`.
  - `interface ReasonContext { subject: GraphNode; target?: GraphNode; evidence: readonly GraphEvidence[] }`.
  - `describeReason(code: string, context: ReasonContext): ReasonView`.
  - `REASON_SENTENCE_FAMILIES: readonly string[]`, the catalog's keys.
  - `REASON_EVIDENCE_KIND: Readonly<Record<string, string>>`, which maps each family to its evidence kind:
    - `manifest-declared` → `package-manifest`;
    - `dependency-declared` → `package-dependency`;
    - every other family → the evidence kind of the same name.
  - `evidenceKey(item: GraphEvidence): string`, built from path, kind, analyzer and lines. Task 7 uses it to match historical evidence.

- [ ] **Step 1: Write the failing tests in `reason-catalog.test.ts`.**
  - `every reason family has a sentence`: `[...REASON_SENTENCE_FAMILIES].sort()` equals `[...REASON_CODE_FAMILIES].sort()`, imported from `@archwise/application`.
  - `client-library names the library and the target technology`: `client-library:pg`, with a target whose technology is `PostgreSQL` and `client-library` evidence at `apps/api/package.json`, gives this text when the parts are joined:
    > "depends on pg, a PostgreSQL client library"

    `pg` is `strong`, and `file` is `'apps/api/package.json'`.
  - `compose-depends-on names the target and the line`: the evidence is `compose.yaml` at lines 14–14, and the target's label is `cache`. The text is "Compose starts it after cache", and `file` is `'compose.yaml · line 14'`.
  - The other sentences, one assertion each:

    | Code | Sentence |
    |---|---|
    | `framework-dependency:fastify`, on a service | "depends on fastify, a server framework" |
    | `framework-dependency:next,express`, on a frontend | "depends on next and express; the frontend framework wins" |
    | `compose-build:api` | "Compose builds it as service api" |
    | `compose-image` | "Compose runs the PostgreSQL image" |
    | `compose-service` | "Compose declares it as a service" |
    | `manifest-declared` | "its package.json declares it" |
    | `dependency-declared` | "package.json lists @shop/db as a dependency" |
    | `prisma-datasource` | "Prisma datasource is PostgreSQL" |
    | `client-library`, on a node | "a package depends on its client library" |

  - `a reason with no matching evidence shows no file`: `file` is `null`.
  - `unknown codes render as the raw code`: `describeReason('via @shop/db', …)` gives `{ parts: [{ text: 'via @shop/db' }], known: false, code: 'via @shop/db' }`. `describeReason('', …)` gives the text `(no reason recorded)` and never an empty string.
  - `graph-types.test.ts`:
    - `accepts optional category, properties and excerptId`;
    - `rejects a property without evidence`;
    - `rejects a non-string excerptId`.
- [ ] **Step 2: Run them and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/reason-catalog.test.ts src/graph-types.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.** Each family's sentence is a function from `(param, context)` to `SentencePart[]`.
  - **File text:** the path, plus `· line N` when the range is one line, or `· lines N–M` when it is longer.
  - **Choosing the evidence:** the first item of `context.evidence` whose kind is `REASON_EVIDENCE_KIND[family]`.
- [ ] **Step 4: Run the Step 2 command and see it pass.** Then commit: `feat(web): reason catalog and optional view-graph fields`.

### Task 5: Names, summary line, relation wording and confidence style

**Files:**
- Create:
  - `apps/web/src/claims.ts`;
  - `apps/web/src/claims.test.ts`.
- Modify:
  - `apps/web/src/App.svelte`: the search filter also matches `aliases`;
  - `apps/web/src/scan-summary.ts`: `nodeDisplayLabel` keeps its current output, for the sessions panel.

**Interfaces:**
- Produces:
  - `primaryName(node: GraphNode): string`, which returns `node.label`. The resolver already labels packages with their package name, Compose nodes with their service name, and resources with their technology.
  - `secondLine(node: GraphNode): string`. It joins with `' · '`, skipping empty parts:
    - the technology;
    - the package folder: the directory of the first `package-manifest` evidence path, or `.` for the root;
    - the repository label.
  - `summaryLine(node: GraphNode, view: Graph): string`, in this order:
    1. the kind phrase;
    2. the technology, if not already in the kind phrase;
    3. `runs in <compose file path>`, when the node has `compose-build`, `compose-service` or `compose-image` evidence; the first such path;
    4. `inferred`, when the node is Inferred;
    5. `uses N`, the outgoing relations in `view`, omitted when 0;
    6. `used by N`, the incoming relations, omitted when 0.
  - **Kind phrases:**
    - datastore with a technology → `<technology> datastore`;
    - external with a category other than `other` → `<Category> API`, where the categories read `Payments`, `Email`, `Storage`, `Auth`, `AI` and `Monitoring`;
    - everything else → `kindLabel(type)`.
  - `relationWording(type: EdgeType): string`, from the table in Global Constraints.
  - `type ConfidenceLevel = 'observed' | 'inferred' | 'unknown'`.
  - `confidenceLevel(node or edge): ConfidenceLevel`. It returns `'unknown'` for a node whose type is not in `NODE_TYPES`, which only fixtures produce (§12.1 ruling 5).
  - `lineStyle(level): 'solid' | 'dashed' | 'dotted'`.
  - `levelWord(level): 'Observed' | 'Inferred' | 'Unknown'`.

- [ ] **Step 1: Write the failing tests.** Use the spec's examples verbatim, with fixtures built in the test:

  | Fixture | Expected summary |
  |---|---|
  | an Observed fastify service with `compose-build` evidence in `compose.yaml`, 4 outgoing and 1 incoming relation | `'Service · fastify · runs in compose.yaml · uses 4 · used by 1'` |
  | a PostgreSQL datastore with `compose-image` evidence, 2 incoming | `'PostgreSQL datastore · runs in compose.yaml · used by 2'` |
  | an Inferred BullMQ queue, 2 incoming | `'Queue · BullMQ · inferred · used by 2'` |
  | an Inferred Stripe external with `category: 'payments'`, 1 incoming | `'Payments API · Stripe · inferred · used by 1'` |
  | an external with `category: 'other'` | starts with `'External service · '` |

  Then:
  - `secondLine` for `@shop/api` (fastify, `apps/api/package.json`) is `'fastify · apps/api'`.
  - `relationWording`: one assertion per row of the table.
  - `summaryLine` never contains the words `main`, `primary` or `the`, checked over all the fixtures above. This guards against invented purposes.
  - `lineStyle`: `observed` → `solid`, `inferred` → `dashed`, `unknown` → `dotted`.
- [ ] **Step 2: Run the tests and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/claims.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement `claims.ts` and the alias search.**
- [ ] **Step 4: Run the tests and see them pass, then commit.**
  Commit: `feat(web): names, summary lines and relation wording from claims only`.

### Task 6: Indirect relations

**Files:**
- Modify:
  - `apps/web/src/system-view.ts`;
  - `apps/web/src/system-view.test.ts`;
  - `apps/web/src/graph-types.ts`: the type only.

**Interfaces:**
- Produces:
  - `interface IndirectRelation { steps: readonly GraphEdge[]; through: readonly string[]; others: readonly (readonly string[])[] }`.
    - `steps` are the original discovered edges, in order.
    - `through` holds the labels of the hidden libraries in the chain that was used.
    - `others` holds the `through` lists of the other chains, sorted.
  - `GraphEdge.indirect?: IndirectRelation`. It lives in the browser only and is never validated from the network.
  - In the System view, indirect edges have:
    - `id: 'indirect:<source>-><target>'`;
    - `type`: the last step's type;
    - `confidence`: `'observed'` only if every step is Observed, otherwise `'inferred'`;
    - `reasons: []`;
    - `evidence`: the de-duplicated union of the steps' evidence, deduplicated with `evidenceKey`.

- [ ] **Step 1: Write the failing tests.** Replace the `lifted:` expectations in `system-view.test.ts`.
  - `indirect relation keeps every step`. api → `@shop/db` (Observed, `dependency-declared`) → `datastore:postgresql` (Inferred, `client-library:pg`). The System view edge `indirect:api->datastore:postgresql` has:
    - two steps;
    - `through: ['@shop/db']`;
    - confidence `inferred`;
    - evidence containing both steps' items.
  - `all-observed chain stays observed`. Lifting alone never lowers confidence.
  - `prefers the chain with fewer inferred steps and lists the other`. A diamond: api → a (Observed) → db (Observed), and api → b (Observed) → db (Inferred). The edge uses `['a']`, has `others: [['b']]`, is `observed`, and exists exactly once.
  - `prefers the shorter chain on equal inferred counts`.
  - `a direct relation wins over an indirect one`. This test is kept from today.
  - `cycles among hidden libraries terminate`.
  - `others are capped at 20 chains per pair`. Twenty-five parallel libraries give `others.length === 20`.
- [ ] **Step 2: Run the tests and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/system-view.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **The strongest chain.** For each visible source, run a search over hidden nodes ordered by the cost `(inferredSteps, length)`, using a sorted frontier and a deterministic id tiebreak. This finds the strongest chain to each visible target exactly.
  - **The other chains.** A depth-first search over hidden nodes, with a per-path visited set, collects the other chains for display. It is capped at `MAX_OTHER_CHAINS = 20` per pair and `MAX_EXPANSIONS_PER_SOURCE = 5000`.
  - **Old sessions.** A Phase 4 PR 1 `via …` reason inside an old session's stored graph needs no migration. The System view is recomputed from the stored full graph.
- [ ] **Step 4: Run the tests and see them pass, then run the whole web suite.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run < /dev/null`
  Expected: PASS.
  Commit: `feat(web): indirect relations carry their chain, weakest-step confidence and evidence union`.

### Task 7: The inspector

**Files:**
- Create:
  - `apps/web/src/Inspector.svelte`;
  - `apps/web/src/Inspector.test.ts`;
  - `apps/web/src/ReasonList.svelte`;
  - `apps/web/src/excerpt-client.ts`;
  - `apps/web/src/excerpt-client.test.ts`.
- Modify:
  - `apps/web/src/App.svelte`: replace the inline inspector markup, and keep `latestGraph` (the served payload) next to `graphData`;
  - `apps/web/src/studio.css`.

**Interfaces:**
- Consumes:
  - `describeReason` and `evidenceKey` (Task 4);
  - `primaryName`, `secondLine`, `summaryLine`, `relationWording`, `levelWord` and `lineStyle` (Task 5);
  - `GraphEdge.indirect` (Task 6).
- Produces:
  - `Inspector.svelte`, with these props:
    - `node: GraphNode | null`;
    - `view: Graph`;
    - `full: Graph`;
    - `excerptIds: ReadonlyMap<string, string>`, mapping an `evidenceKey` to an `excerptId` from the latest served graph;
    - `tab: 'details' | 'relations' | 'evidence'`, bindable;
    - `onSelect(id: string): void`.
  - `fetchExcerpt(id: string, fetcher?: typeof fetch): Promise<ExcerptResult | { status: 'error' }>`.
  - `excerptIdsFrom(graph: Graph): Map<string, string>`.

- [ ] **Step 1: Write the failing component tests in `Inspector.test.ts`.** Use `@testing-library/svelte` with `{ props }`.
  - `header is text only`. It shows the primary name, the kind with a swatch, and the summary line, and the header contains no `<svg>`.
  - `observed band reads "Observed because:" with sentences`. For an Observed node, each sentence appears with its code in a `<code>`, and the inferred warning is absent.
  - `inferred band shows the warning`. The text includes "Inferred because:" and "No file states this directly. Check before relying on it."
  - `details shows properties with their source and hides properties without evidence`.
    - The `ports` property shows `8080:80` with the suffix `compose.yaml:4`.
    - Aliases show as "Also called api · compose.yaml:2".
  - `relations groups Uses and Used by and activating a row selects`. Each row shows:
    - the other node's name and kind;
    - "depends on";
    - the level word;
    - the reasons.

    Clicking a row calls `onSelect` with the other node's id.
  - `indirect relation row lists its steps and "Also through"`. Each step shows its own level and reason sentence. The row also shows "Also through b".
  - `evidence groups by file with copy and show lines`. Assert:
    - there is one group per path;
    - each item shows its rule (`kind`) and its range;
    - **Copy `path:line`** calls a stubbed `navigator.clipboard.writeText` with `compose.yaml:14`;
    - **Show lines** calls the stubbed fetcher with `/api/v1/evidence/excerpt/<id>`, then renders the lines in a `<pre>` as text: an excerpt line `<b>x</b>` appears literally.
  - `historical evidence maps to the latest scan's excerpt id or says it is unavailable`. When the evidence key is absent from `excerptIds`, the button is absent and the verbatim earlier-scan sentence appears.
  - `changed and unavailable results are explained`.
    - `changed` gives "This file changed since the scan."
    - `unavailable`/`denied` gives "Not shown: this file is on the deny list."
    - The other reasons map one-to-one to short sentences, asserted in `excerpt-client.test.ts`.
  - `the active tab survives a selection change`.
  - `empty state copy`. With `node` null, the verbatim empty sentence appears.
- [ ] **Step 2: Run the tests and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/Inspector.test.ts src/excerpt-client.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Tabs.** Use a WAI-ARIA tablist, with arrow keys between tabs and `aria-selected`. The active tab gets the `--accent` underline.
  - **Clipboard failure.** If the clipboard is unavailable, show "Copy failed — select the text instead" with the text visible.
  - **Excerpt lifetime.** Excerpt results live only in component state, and are dropped when the selection changes.
  - **Architecture Coach.** It stays below the inspector, unchanged.
- [ ] **Step 4: Run the tests and see them pass. Run `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run < /dev/null`, then commit.**
  Commit: `feat(web): inspector with confidence band, Details, Relations and Evidence tabs`.

### Task 8: The list and the canvas labels

**Files:**
- Modify:
  - `apps/web/src/App.svelte`: the component list;
  - `apps/web/src/IsoNode.svelte`;
  - `apps/web/src/DiscoveredNode.svelte`;
  - `apps/web/src/DiscoveredEdge.svelte`;
  - `apps/web/src/ArchitectureCanvas.svelte`: it passes `label` and `focusLabel` in the edge data, and `category` through to `pieceForNode`;
  - `apps/web/src/studio.css`.
- Test:
  - `IsoNode.test.ts`;
  - `DiscoveredNode.test.ts`;
  - `DiscoveredEdge.test.ts`;
  - a new `apps/web/src/component-list.test.ts`, if the list is extracted into `ComponentList.svelte`. That extraction is recommended, because `App.svelte` is 441 lines.

**Interfaces:**
- Consumes:
  - `secondLine`, `relationWording` and `lineStyle` (Task 5);
  - `describeReason` (Task 4);
  - `GraphEdge.indirect` (Task 6).
- Produces:
  - The edge data gains:
    - `label: string`, the wording, plus `' · through ' + through.join(', ')` for an indirect relation;
    - `focusLabel: string`: `label + ' · because ' + <first reason sentence>`, using the first step's first reason for an indirect relation.
  - The `ComponentList.svelte` props are `nodes`, `selectedId`, `onSelect`, `filter: Filter | null` (Task 9) and `graph`.

- [ ] **Step 1: Write the failing tests.**
  - `DiscoveredEdge`:
    - `shows the wording as its label` (label `depends on`);
    - `expands to the because label when focused`;
    - `indirect label names the libraries`.

    Labels are text nodes. Escaped content is checked with a label holding `<i>`.
  - `IsoNode` and `DiscoveredNode`:
    - `second line shows technology and folder`;
    - `inferred node shows its first reason on the canvas`: the visible text includes "Inferred because: depends on pg, a PostgreSQL client library";
    - `marker uses the level's line style`: an `unknown` fixture gives a dotted outline class.
  - `component-list.test.ts`:
    - `each item shows name, second line and level marker`;
    - `inferred items show their first reason sentence`;
    - `activating an item selects it`.
- [ ] **Step 2: Run the tests and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/DiscoveredEdge.test.ts src/IsoNode.test.ts src/DiscoveredNode.test.ts src/component-list.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Edge labels.** Use `EdgeLabel` from `@xyflow/svelte` at the path midpoint, with a `--panel` background and `--ink-2` text. A focused label uses `--ink`. Labels stay legible when dimmed, at 40% opacity.
  - **The node's reason line.** It is clipped with an ellipsis. The full sentence goes in the accessible name and the `title`.
  - **Node sizes.** If the extra reason line changes a node's height, update `NODE_SIZE` in `graph-layout.ts` and its test.
- [ ] **Step 4: Run the tests and see them pass, run the web suite, then commit.**
  Commit: `feat(web): names, reasons and relation wording on the list and the canvas`.

### Task 9: Counters, filters and the hidden-libraries row

**Files:**
- Create:
  - `apps/web/src/counters.ts`;
  - `apps/web/src/counters.test.ts`;
  - `apps/web/src/Counters.svelte`.
- Modify:
  - `apps/web/src/App.svelte`;
  - `apps/web/src/canvas-decoration.ts` and its test;
  - `apps/web/src/ScanNotes.svelte`, which gains a bindable `open` and focuses its heading when opened;
  - `apps/web/src/ComponentList.svelte`.

**Interfaces:**
- Consumes: `scanNotes` (existing), and `systemGraph`/`graphForView` (Task 6).
- Produces:
  - `type Filter = 'inferred-components' | 'inferred-relations'`.
  - `interface CounterView { components: { total: number; inferred: number }; relations: { total: number; inferred: number }; files: number; notes: number }`.
  - `countersFor(view: Graph, notes: ScanNotesView): CounterView`.
  - `counterLabels(c: CounterView): { components: string; relations: string; scan: string | null }`. The spec's examples are verbatim:
    - "7 components · 3 inferred";
    - "8 relations · 5 inferred";
    - "1 file not analyzed · 2 notes".

    The singular forms apply, and the "· N inferred" part is omitted when it is 0.
  - `hiddenLibraries(full: Graph): GraphNode[]`, which returns the modules the System view hides, sorted by label.
  - `decorate(list, links, { selected, focus, filter })`:
    - with a filter, items that do not match get `dimmed: true`;
    - matching items are never coloured differently;
    - when both a filter and a focus apply, the selection's focus wins.

- [ ] **Step 1: Write the failing tests.**
  - `counters.test.ts`:
    - the labels above for a fixture with 7 components (3 Inferred), 8 relations (5 Inferred), 1 gap file and 2 diagnostics;
    - `"0 inferred" is omitted`;
    - `singular forms`;
    - `hiddenLibraries lists the modules the system view hides`.
  - `canvas-decoration.test.ts`:
    - `inferred-components filter dims observed nodes and all edges`;
    - `inferred-relations filter dims observed edges and no nodes`;
    - `filter adds no colour`: no data key other than `dimmed` changes.
  - A Svelte test for `Counters.svelte`:
    - activating "3 inferred" sets the filter, with `aria-pressed=true`;
    - activating it again clears the filter;
    - Esc clears it;
    - activating "1 file not analyzed" opens Scan notes and moves focus to its heading.
  - A `ComponentList` test: `hidden libraries row lists them and offers All packages`. The row reads "Libraries · 3 hidden". Activating it expands the list, and its button "Show all packages" calls `onShowAll`.
- [ ] **Step 2: Run the tests and see them fail.**
  Run: `npx --yes pnpm@10.34.9 --filter @archwise/web exec vitest run src/counters.test.ts src/canvas-decoration.test.ts src/Counters.test.ts src/component-list.test.ts < /dev/null`
  Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Where the counters go.** They sit in the workspace header (§4.2 centre column).
  - **Esc.** It clears the filter only when no drawer is open and no text field has focus. Otherwise the canvas keeps its own Esc, which clears the selection.
  - **Switching view.** A filter persists across selections, and resets when the person switches between the System and All packages views.
- [ ] **Step 4: Run the tests and see them pass, run the web suite, then commit.**
  Commit: `feat(web): labelled counters that filter, and the hidden-libraries row`.

### Task 10: Smoke, docs and changeset

**Files:**
- Modify:
  - `scripts/browser-smoke.mjs`;
  - `docs/architecture.md`;
  - `docs/discovery.md`, for categories, Compose line evidence and properties, and analyzer versions;
  - `docs/security.md`, if Task 3 left anything out;
  - `docs/alpha-testing.md`: the keyboard-only walkthrough and the manual accessibility check;
  - `docs/custom-nodes-and-inspector.md`;
  - `docs/canvas-first-ux.md`;
  - `docs/implementation-roadmap.md`: mark the redesign done;
  - `README.md`;
  - `apps/web/README.md`;
  - `CONTEXT.md`, only if a term changed.
- Create: `.changeset/studio-redesign-comprehension.md`.

- [ ] **Step 1: Add the smoke checks (§9).** Run them against `examples/demo`, and make each one fail first by mutating the code it guards. Record the mutation in the ledger.
  - Clicking a component fills the inspector header and band.
  - Clicking a list item does the same.
  - Activating a Relations row selects the other component.
  - Every Inferred component shows "Inferred because:" in the list, in the canvas label and in the inspector.
  - The Evidence tab's Show lines renders lines for a `package.json`, and the response carries `cache-control: no-store`.
  - The counter "inferred" filter dims at least one node. Esc clears it.
  - An edge label reads "depends on".
  - The smoke already checks no console errors, both themes, reduced motion and the dot stop. Those checks stay.
  - Screenshots: dark and light, at 1600 × 950 and at 1024 × 768, saved to `ARCHWISE_SMOKE_SCREENSHOT_DIR`.
- [ ] **Step 2: Run the smoke and see it pass.**
  Run: `npx --yes pnpm@10.34.9 build && ARCHWISE_BROWSER_CHANNEL=chrome ARCHWISE_PLAYWRIGHT_ENTRY=<playwright entry> node scripts/browser-smoke.mjs`
  Expected: `Browser smoke passed`.
- [ ] **Step 3: Audit the docs.** Grep `docs/`, `README.md` and `apps/*/README.md` for each of these terms, and fix every stale statement:
  - "lifted", "via", "Confidence: inferred", "file contents never", "excerpt";
  - "category", "Compose", "inspector", "Outgoing relations".

  axe-core is not in the toolchain, so the accessibility check is the documented manual walkthrough (spec §9).
- [ ] **Step 4: Run the full check and commit.**
  Run: `npx --yes pnpm@10.34.9 check < /dev/null`
  Expected: PASS.
  Commit: `docs: comprehension rules, excerpts and Compose properties; smoke coverage`.
