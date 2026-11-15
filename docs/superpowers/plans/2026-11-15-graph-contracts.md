# Graph Contracts (Phase 2, first slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a validated, immutable, deterministically serializable graph revision v1 (`archwise.graph`) in `@archwise/domain` and `@archwise/schemas`, using synthetic evidence only.

**Architecture:**
- `domain` owns two things: readonly types and pure semantic validation. Semantic validation covers IDs, paths, references, containment acyclicity, limits, secret patterns, canonical ordering, construction with deep freeze, and sandbox binding.
- `schemas` owns three things: strict Zod structural parsing with version dispatch, a bounded JSON import, and canonical serialization. It calls the domain validator.
- Neither package touches the filesystem, the clock or randomness. No SQLite, no discovery wiring, no UI.

**Tech Stack:** TypeScript 5.9 strict ESM (target ES2022, so no `toSorted`), Zod 4.6.7 (already a schemas dependency), Vitest 5.

**Spec:** `docs/superpowers/specs/2026-11-11-graph-contracts-design.md` (owner approved 2026-11-15).

## Global Constraints

- Envelope: `format: "archwise.graph"`, `version: 1`, exactly one `revision`. Unknown fields are rejected at every object boundary.
- ID pattern: `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`. IDs are unique within their own collection; the same ID may appear in two different collections.
- Node kinds: `system, repository, service, module, api, job, queue, topic, datastore, external-system, deployment-unit`.
- Edge kinds: `contains, depends-on, calls, publishes, consumes, reads, writes, deploys-to, exposes`.
- Confidence: `observed | inferred | unknown`, with a nonempty list of unique reason codes.
- Coverage status: `complete | partial | failed | unsupported`. A revision with status `complete` must not contain `partial` or `failed` coverage.
- Diagnostic severity: `info | warning | error`.
- Limits:
  - Import size is 16 MiB (16,777,216 bytes), measured as UTF-8 before parsing.
  - At most 10,000 entries per record collection.
  - At most 1,000 IDs per reference list.
  - Labels are at most 256 code points.
  - Paths are at most 1,024 characters.
- Canonical JSON:
  - Field order is explicit.
  - Collections are sorted by ID; coverage is sorted by `repositoryId`, then `analyzerId`, then `analyzerVersion`; reference and reason lists are sorted.
  - All sorting uses ASCII code-unit order (`a < b`), never `localeCompare`.
  - Output is compact, with no trailing newline.
- Errors never echo rejected values. They carry only a stable code and a structural path.
- `domain` has no runtime dependencies and uses no Node APIs. `schemas` may depend only on `domain` and `zod`.
- All commits are signed off (`git commit -s`) and end with the repository's Co-Authored-By attribution line.

## Review Focus

1. **Calendar-impossible timestamps** such as `2026-02-30T00:00:00.000Z` match a naive regex. They must be rejected with `invalid-timestamp` (owner: Task 2).
2. **`__proto__` and `constructor` keys in imported JSON** must be rejected as unknown fields. They must not pollute prototypes or be silently dropped (owner: Task 5).
3. **The import size limit counts UTF-8 bytes, not UTF-16 length.** A string of 5,592,406 three-byte characters (`"€"`) exceeds 16 MiB even though its `.length` is smaller (owner: Task 5).
4. **Unicode labels** (emoji, combining marks, RTL text) must survive a round trip byte-identically and must not be normalized. A 256-emoji label is valid; 257 is not (owner: Tasks 1 and 5).
5. **A secret inside an invalid ID or path must not appear anywhere in the serialized error result** (owner: Task 4).

---

### Task 1: Domain vocabulary and primitive validators

**Files:**
- Create: `packages/domain/src/graph.ts`, `packages/domain/src/primitives.ts`
- Modify: `packages/domain/src/index.ts` (re-export; keep `CURRENT_SNAPSHOT_VERSION`)
- Test: `packages/domain/tests/primitives.test.ts`

**Interfaces — Produces:**

```ts
// graph.ts
export const GRAPH_FORMAT = 'archwise.graph';
export const GRAPH_VERSION = 1;
export const NODE_KINDS = [/* 11 kinds, spec order */] as const;
export type NodeKind = (typeof NODE_KINDS)[number];
export const EDGE_KINDS = [/* 9 kinds */] as const;
export type EdgeKind = (typeof EDGE_KINDS)[number];
export type ConfidenceLevel = 'observed' | 'inferred' | 'unknown';
export interface Confidence { readonly level: ConfidenceLevel; readonly reasons: readonly string[] }
export interface Repository { readonly id: string; readonly label: string }
export interface LineRange { readonly start: number; readonly end: number }
export interface Evidence { readonly id: string; readonly repositoryId: string; readonly analyzerId: string;
  readonly analyzerVersion: string; readonly ruleId: string; readonly path: string; readonly lines: LineRange | null }
export type CoverageStatus = 'complete' | 'partial' | 'failed' | 'unsupported';
export interface AnalyzerCoverage { readonly repositoryId: string; readonly analyzerId: string;
  readonly analyzerVersion: string; readonly status: CoverageStatus }
export interface GraphNode { readonly id: string; readonly kind: NodeKind; readonly label: string;
  readonly repositoryId: string | null; readonly confidence: Confidence; readonly evidenceIds: readonly string[] }
export interface GraphEdge { readonly id: string; readonly kind: EdgeKind; readonly sourceId: string;
  readonly targetId: string; readonly confidence: Confidence; readonly evidenceIds: readonly string[] }
export type DiagnosticReferenceKind = 'repository' | 'node' | 'edge' | 'evidence';
export interface DiagnosticReference { readonly kind: DiagnosticReferenceKind; readonly id: string }
export interface Diagnostic { readonly id: string; readonly severity: 'info' | 'warning' | 'error';
  readonly code: string; readonly references: readonly DiagnosticReference[] }
export interface GraphRevision { readonly id: string; readonly workspaceId: string;
  readonly parentRevisionId: string | null; readonly createdAt: string; readonly status: 'complete' | 'partial';
  readonly repositories: readonly Repository[]; readonly coverage: readonly AnalyzerCoverage[];
  readonly evidence: readonly Evidence[]; readonly nodes: readonly GraphNode[]; readonly edges: readonly GraphEdge[];
  readonly diagnostics: readonly Diagnostic[] }
export const LIMITS = { importBytes: 16_777_216, collection: 10_000, references: 1_000, label: 256, path: 1_024 } as const;

// primitives.ts — each returns true when valid
export function isValidId(value: string): boolean;          // ID pattern
export function isValidCode(value: string): boolean;        // reason/diagnostic code: ^[a-z][a-z0-9-]{0,63}$
export function isValidLabel(value: string): boolean;       // 1..256 code points, no C0/C1 controls (U+0000–001F, U+007F–009F)
export function isValidTimestamp(value: string): boolean;   // /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/ AND new Date(v).toISOString() === v
export type PathIssue = 'empty' | 'too-long' | 'absolute' | 'backslash' | 'drive-prefix' | 'empty-segment' | 'dot-segment' | 'control-character';
export function checkRelativePath(value: string): PathIssue | null;
export function containsSecretPattern(value: string): boolean;
export function compareCodeUnits(a: string, b: string): number; // -1/0/1 by `<`, never localeCompare
```

`containsSecretPattern` must detect the following (synthetic test values are built at runtime by string concatenation so that Gitleaks does not flag the test file):
- AWS key IDs: `AKIA[0-9A-Z]{16}`
- PEM private key headers: `-----BEGIN [A-Z ]*PRIVATE KEY-----`
- GitHub tokens: `gh[pousr]_[A-Za-z0-9]{36,}`
- Slack tokens: `xox[abprs]-[A-Za-z0-9-]{10,}`
- API keys: `sk-[A-Za-z0-9_-]{20,}`
- JWTs: `eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.`

- [ ] **Step 1: Write failing tests** in `primitives.test.ts`. Use `test.each` tables:
  - `isValidId`: accepts `a`, `A9._:-x`, and a 128-character ID. Rejects `''`, `-a`, `.a`, `a b`, `é`, and a 129-character ID.
  - `isValidLabel`: accepts `'🚀'.repeat(256)` and `'e\u0301'`. Rejects `''`, `'🚀'.repeat(257)`, `'a\u0000'`, and `'a\u0085'`.
  - `isValidTimestamp`: accepts `2026-11-15T10:20:30.000Z`. Rejects `2026-02-30T00:00:00.000Z`, `2026-11-15T10:20:30Z`, `2026-11-15T10:20:30.000+00:00`, and `2026-11-15`.
  - `checkRelativePath`: `src/a.ts` returns `null`.
    - `''` → `'empty'`
    - `'/etc/x'` → `'absolute'`
    - `'a\\b'` → `'backslash'`
    - `'C:/x'` → `'drive-prefix'`
    - `'a//b'` and `'a/'` → `'empty-segment'`
    - `'./a'` and `'a/../b'` → `'dot-segment'`
    - `'a\u0000b'` → `'control-character'`
    - `'a'.repeat(1025)` → `'too-long'`
  - `containsSecretPattern`: true for one synthetic example per pattern; false for `ordinary-label`.
  - `compareCodeUnits`: sorting `['b', 'B', 'a', '_']` yields `['B', '_', 'a', 'b']`.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/domain test`. Expected: FAIL (module not found).
- [ ] **Step 3:** Implement `graph.ts` and `primitives.ts` with the signatures above, and re-export both from `index.ts`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(domain): add graph vocabulary and primitive validators`.

### Task 2: Semantic validation, canonical ordering and construction

**Files:**
- Create: `packages/domain/src/validation.ts`, `packages/domain/src/revision.ts`
- Create test helper: `packages/domain/tests/fixtures.ts`, exporting `validRevision(): GraphRevision`. The fixture is synthetic:
  - 2 repositories, 1 coverage entry per repository (both `complete`), and 3 evidence records (one with `lines: {start: 3, end: 7}`).
  - Nodes `svc-a` (service) and `mod-b` (module); edges `contains` (`svc-a` → `mod-b`) and `calls` (`mod-b` → `mod-b`, a self-call).
  - 1 diagnostic referencing a node.
  - `createdAt: '2026-11-15T00:00:00.000Z'`, `parentRevisionId: null`, status `complete`.
- Test: `packages/domain/tests/validation.test.ts`, `packages/domain/tests/revision.test.ts`

**Interfaces — Consumes:** everything from Task 1.

**Interfaces — Produces:**

```ts
export type ValidationErrorCode =
  | 'invalid-id' | 'duplicate-id' | 'dangling-reference' | 'missing-evidence' | 'invalid-confidence'
  | 'invalid-code' | 'invalid-label' | 'invalid-timestamp' | 'invalid-line-range' | 'unsafe-path'
  | 'secret-pattern' | 'limit-exceeded' | 'containment-cycle' | 'self-containment' | 'parent-is-self'
  | 'incomplete-coverage' | 'duplicate-coverage' | 'duplicate-reference';
export interface ValidationIssue { readonly code: string; readonly path: readonly (string | number)[] }
export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };
export function validateRevision(revision: GraphRevision): readonly ValidationIssue[]; // [] means valid
export function canonicalizeRevision(revision: GraphRevision): GraphRevision;         // fresh objects, declared fields only, canonical order
export function createRevision(input: GraphRevision): ValidationResult<GraphRevision>;
```

`ValidationIssue.code` is typed as `string` so that schemas can add its own codes in Task 4. Domain emits only `ValidationErrorCode` values.

Rules and the code each one produces:
- **`invalid-id`:** any ID or reference ID fails `isValidId`. Analyzer IDs, analyzer versions and rule IDs use `isValidId` too.
- **`duplicate-id`:** an ID repeats within one collection.
- **`dangling-reference`:** a reference points to a target that does not exist in its typed collection. This covers evidence and coverage `repositoryId`, a non-null node `repositoryId`, edge source and target, `evidenceIds`, and diagnostic references.
- **`missing-evidence`:** a node or edge has an empty `evidenceIds` list.
- **`invalid-confidence`:** an empty reasons list.
- **`invalid-code`:** a reason or diagnostic code fails `isValidCode`.
- **`duplicate-reference`:** duplicates within `evidenceIds`, reasons, or diagnostic references.
- **`invalid-line-range`:** the line range is not two positive integers with `end >= start`.
- **`unsafe-path`:** `checkRelativePath` returns an issue.
- **`secret-pattern`:** any label, path, analyzer ID, rule ID or code contains a secret pattern.
- **`limit-exceeded`:** a collection has more than 10,000 entries or a reference list has more than 1,000.
- **`parent-is-self`:** `parentRevisionId === id`.
- **`incomplete-coverage`:** the status is `complete` while any coverage entry is `partial` or `failed`.
- **`duplicate-coverage`:** the same `(repositoryId, analyzerId, analyzerVersion)` appears twice.
- **`self-containment`:** a `contains` edge has the same source and target.
- **`containment-cycle`:** a cycle exists among `contains` edges only. Detect it with iterative DFS (no recursion, so 10,000 nodes cannot overflow the stack). Cycles and self-loops on all other edge kinds are allowed.

Path segments name the location, for example `['nodes', 3, 'evidenceIds', 0]`. Validation collects all issues in deterministic order: field traversal order, then ascending index.

`createRevision` does three things in order:
1. Calls `canonicalizeRevision`, which is the copy and drops undeclared fields.
2. Validates the copy.
3. On success, recursively freezes the copy with `Object.freeze` and returns it.

- [ ] **Step 1: Write failing tests** in `validation.test.ts`. Make one `test.each` row per error code: mutate a `structuredClone(validRevision())` and assert that `validateRevision(...)` contains `{code, path}` with the exact path. Then add these cases:
  - Every node kind and every edge kind, each in its own edge-free fixture variant, validates to `[]`.
  - The same ID used for a node and an edge is valid.
  - A dependency cycle (`depends-on` a→b→a) is valid.
  - A `contains` cycle a→b→a yields `containment-cycle`.
- [ ] **Step 2: Write failing tests** in `revision.test.ts`:
  - The empty revision (all collections `[]`, status `partial`) is ok.
  - Mutating the input after creation does not change the result.
  - `Object.isFrozen` is true on the result and on `result.nodes[0].confidence.reasons`.
  - Reversed input collections produce a result deep-equal to the original's result.
  - An extra property (`(input as any).extra = 1`) is absent from the result.
  - Invalid input returns `ok: false` with no `value`.
- [ ] **Step 3:** Run `npx --yes pnpm@10.34.9 --filter @archwise/domain test`. Expected: FAIL.
- [ ] **Step 4:** Implement `validation.ts` and `revision.ts`, and export them.
- [ ] **Step 5:** Run the tests again. Expected: PASS.
- [ ] **Step 6:** Commit with `feat(domain): validate, canonicalize and freeze graph revisions`.

### Task 3: Sandbox reference binding

**Files:**
- Create: `packages/domain/src/sandbox.ts`
- Test: `packages/domain/tests/sandbox.test.ts`

**Interfaces — Produces:**

```ts
export interface SandboxReference { readonly sandboxId: string; readonly schemaVersion: 1;
  readonly workspaceId: string; readonly baseRevisionId: string }
export function bindSandbox(reference: SandboxReference, revision: GraphRevision): ValidationResult<SandboxReference>;
```

The function returns these codes:
- `invalid-id` when any ID is invalid.
- `workspace-mismatch` (path `['workspaceId']`).
- `base-mismatch` (path `['baseRevisionId']`).
- On success, a frozen copy of the reference.

- [ ] **Step 1:** Write failing tests for the matching case, a workspace mismatch, a base mismatch, and an invalid sandbox ID.
- [ ] **Step 2:** Run the domain tests. Expected: FAIL.
- [ ] **Step 3:** Implement and export `bindSandbox`.
- [ ] **Step 4:** Run the domain tests. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(domain): bind sandbox references to a base revision`.

### Task 4: Strict structural schema and version dispatch

**Files:**
- Modify: `packages/schemas/package.json`: add `"@archwise/domain": "workspace:*"` to dependencies, then run `npx --yes pnpm@10.34.9 install --ignore-scripts` to update the lockfile. No external package is added.
- Create: `packages/schemas/src/graph-schema.ts`, `packages/schemas/src/parse-graph.ts`
- Modify: `packages/schemas/src/index.ts` (re-export; keep `snapshotEnvelopeSchema` unchanged as the legacy helper)
- Test: `packages/schemas/tests/graph-schema.test.ts`, plus `packages/schemas/tests/fixtures.ts` holding a plain-object envelope that mirrors the Task 2 fixture.

**Interfaces — Consumes:** `GraphRevision`, `ValidationResult`, `createRevision`, `NODE_KINDS`, `EDGE_KINDS`, `GRAPH_FORMAT`, `LIMITS` from `@archwise/domain`.

**Interfaces — Produces:**

```ts
export const graphRevisionSchema: z.ZodType; // .strict() on every object; arrays .max(LIMITS.collection / LIMITS.references)
export function parseGraphEnvelope(input: unknown): ValidationResult<GraphRevision>;
```

`parseGraphEnvelope` checks the input in this order:
1. Not a plain object, or `format !== 'archwise.graph'` → `invalid-format` (path `['format']`).
2. `version` is not a safe integer → `malformed-version`; below 1 → `unsupported-older-version`; above 1 → `unsupported-future-version` (path `['version']`).
3. Strict Zod parse of `{format, version, revision}`. Each Zod issue maps to `{code: 'invalid-structure', path: issue.path}`. Unknown keys map to `unknown-field` (the path includes the key name, which is schema-structural, not a value). Use only `issue.path` and `issue.code`, never `issue.message` or `issue.input`.
4. `createRevision(parsed.revision)`.

Add a type-level test: `expectTypeOf<z.output<typeof graphRevisionSchema>>().toMatchTypeOf<GraphRevision>()`.

- [ ] **Step 1: Write failing tests:**
  - The valid envelope is ok.
  - `{format: 'x'}` → `invalid-format`.
  - Versions `'1'`, `1.5`, `0`, `2` → the four version codes.
  - An unknown field at the envelope, revision, node, confidence and evidence levels → `unknown-field` each.
  - An unknown node kind → `invalid-structure`.
  - A semantic error, such as a dangling edge target, still surfaces the domain code `dangling-reference`.
  - **Review Focus 5:** an envelope whose node ID is a synthetic secret plus a space (an invalid ID) gives a `JSON.stringify(result)` that does not contain the secret string.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 --filter @archwise/schemas test`. Expected: FAIL.
- [ ] **Step 3:** Implement `graph-schema.ts` and `parse-graph.ts`, and export them.
- [ ] **Step 4:** Run the build and test command (domain must be built first): `npx --yes pnpm@10.34.9 build && npx --yes pnpm@10.34.9 --filter @archwise/schemas test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat(schemas): parse archwise.graph v1 envelopes strictly`. Include `pnpm-lock.yaml`.

### Task 5: Bounded JSON import, canonical serialization and golden fixture

**Files:**
- Create: `packages/schemas/src/graph-json.ts`
- Test: `packages/schemas/tests/graph-json.test.ts`, plus `packages/schemas/tests/golden.ts` exporting `GOLDEN_REVISION_JSON: string`. The golden fixture is a string constant (not a `.json` file) so that Prettier cannot reformat it.

**Interfaces — Consumes:** `parseGraphEnvelope` (Task 4); `canonicalizeRevision`, `validateRevision` and `LIMITS` (domain).

**Interfaces — Produces:**

```ts
export function importGraphJson(text: string): ValidationResult<GraphRevision>;
export function serializeGraphRevision(revision: GraphRevision): ValidationResult<string>;
```

`importGraphJson` behaves as follows:
- It counts bytes with `new TextEncoder().encode(text).byteLength`. Above `LIMITS.importBytes` it returns `input-too-large` before parsing.
- A `JSON.parse` failure returns `invalid-json` with path `[]`.
- Otherwise it calls `parseGraphEnvelope`.

`serializeGraphRevision` behaves as follows:
- It runs `validateRevision`. If there are issues it returns `ok: false`.
- Otherwise it builds `{format, version, revision}` from `canonicalizeRevision` output, writing each object's fields in the order of the Task 1 interfaces, and returns `JSON.stringify(obj)` with no spacing.

- [ ] **Step 1: Write failing tests:**
  - `serializeGraphRevision(fixture)` equals `GOLDEN_REVISION_JSON` exactly. Generate the constant once from the implementation, then review it by hand against the canonical rules.
  - **Determinism:** 20 seeded permutations of every collection and list (use a small LCG, not `Math.random`) all serialize to the same string.
  - **Round trip:** `importGraphJson(serialize(x))` then `serialize` again gives identical bytes.
  - The string does not end with `\n`.
  - **Review Focus 4:** the label `'🚀 e\u0301 مرحبا'` round-trips byte-identically.
  - **Review Focus 3:** `'"' + '€'.repeat(5_592_406) + '"'` → `input-too-large`.
  - `'{'` → `invalid-json`.
  - **Review Focus 2:** `'{"format":"archwise.graph","version":1,"revision":{...,"__proto__":{"x":1}}}'` → `unknown-field`, and `({} as any).x` stays `undefined`.
  - A label containing a synthetic AWS key → `secret-pattern`, and the result JSON does not contain the key.
- [ ] **Step 2:** Run the schemas tests. Expected: FAIL.
- [ ] **Step 3:** Implement `graph-json.ts` and export it.
- [ ] **Step 4:** Run the schemas tests. Expected: PASS. The existing CI matrix (Linux/macOS/Windows × Node 24/26) verifies that the golden output is cross-platform.
- [ ] **Step 5:** Commit with `feat(schemas): import and canonically serialize graph revisions`.

### Task 6: Documentation, changeset and full verification

**Files:**
- Modify:
  - `packages/domain/README.md` and `packages/schemas/README.md` (responsibilities and public API)
  - `docs/superpowers/specs/2026-11-11-graph-contracts-design.md` (status: approved 2026-11-15; implemented by this plan)
  - `docs/implementation-roadmap.md` (Phase 2 status: graph-contracts slice implemented; SQLite persistence, ports and migrations remain)
- Create: `.changeset/graph-contracts.md` (patch for `@archwise/domain` and `@archwise/schemas`)

- [ ] **Step 1:** Update the documents above. They must describe only what is implemented and must not claim that Phase 2 is complete.
- [ ] **Step 2:** Run `npx --yes pnpm@10.34.9 check`. Expected: format, build, lint, typecheck, boundaries and tests all pass. If `format:check` fails, run `npx --yes pnpm@10.34.9 format` and re-run the check.
- [ ] **Step 3:** Run `git status --short` and confirm that no generated `dist/`, caches or stray files are staged.
- [ ] **Step 4:** Commit with `docs: document graph contracts slice and mark spec approved`.
- [ ] **Step 5:** Push `feat/graph-contracts` and open a PR with base `docs/graph-contracts-design` (it is stacked on PR #5). The PR body lists what is implemented, what is deferred (SQLite, ports, migrations) and the verification evidence. Wait for the CI matrix to pass.
