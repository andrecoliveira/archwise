# Archwise Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the legal/community baseline and a buildable, strictly bounded TypeScript monorepo on which every Archwise feature can be developed safely.

**Architecture:** pnpm workspaces and Turborepo coordinate small ESM packages. Pure domain and schema packages sit at the dependency center; application and adapters depend inward, while CLI, server, and React apps compose the system. CI enforces formatting, types, tests, builds, public entry points, and dependency direction.

**Tech Stack:** Node.js LTS, pnpm, TypeScript strict mode, ESM, Turborepo, Vitest, Zod, ESLint, Prettier, dependency-cruiser, Changesets, React, Vite, GitHub Actions.

---

## Required owner decision

The owner approved Apache-2.0, DCO, and GitHub Private Vulnerability Reporting. Reporting was enabled and verified through the GitHub API. Community conduct enforcement and repository protection still require completion before Phase 0 closes. Independent foundation tooling may proceed while those governance items are resolved.

## Target structure

Execution update: ADRs 0003 and 0004 supersede historical tool versions below. `vitest.config.ts` with projects replaces workspace configuration. Root tooling, core contracts, fixture helpers, CLI/server/web shells, lint, dependency boundaries and Changesets are implemented in PR #4. CI includes platform checks, audit and secret scanning. Task 1 governance prerequisites, CodeQL/dependency-review availability, branch protection and final phase closure remain open. Use current manifests and development guides for runnable commands.

```text
apps/{cli,server,web}
packages/{domain,schemas,application,test-fixtures}
scripts/{check-workspace.mjs,check-boundaries.mjs}
.github/{ISSUE_TEMPLATE,workflows,CODEOWNERS,pull_request_template.md}
docs/{decisions,development}
package.json
pnpm-workspace.yaml
turbo.json
tsconfig.base.json
eslint.config.js
prettier.config.mjs
vitest.workspace.ts
```

## Task 1: Legal and community governance

**Files:**
- Create: `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`
- Create: `.github/CODEOWNERS`, `.github/pull_request_template.md`
- Create: `.github/ISSUE_TEMPLATE/bug.yml`, `.github/ISSUE_TEMPLATE/feature.yml`, `.github/ISSUE_TEMPLATE/config.yml`
- Create: `docs/decisions/0003-toolchain-and-compatibility.md`
- Modify: `README.md`, `docs/decisions/0001-local-first-open-source.md`

- [x] **Step 1: Record explicit decisions**

Obtain the license SPDX identifier, private security contact, and DCO/CLA choice from the owner. Expected: three explicit values in the tracking issue or PR. Stop if any value is absent.

- [ ] **Step 2: Add canonical policies**

Use the unmodified canonical license and Contributor Covenant 2.1 texts. `CONTRIBUTING.md` must define prerequisites, branch/PR flow, Conventional Commits, `pnpm check`, ADR triggers, decision policy, and review expectations. `SECURITY.md` must define private reporting, supported versions, response targets, and a prohibition on public exploit reports.

- [ ] **Step 3: Add contribution forms**

The bug form requests version, OS, reproduction, expected/actual behavior, and redaction confirmation. The feature form requests the problem, local-first impact, alternatives, and affected specification. The PR template covers tests, security/privacy, compatibility, documentation, and UI evidence.

- [ ] **Step 4: Verify no placeholders**

Run: `rg -n 'TBD|TODO|example@example.com|YOUR' README.md CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md .github docs/decisions`

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add LICENSE CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md README.md .github docs/decisions
git commit -m "docs: establish project governance"
```

## Task 2: Bootstrap root tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
- Create: `prettier.config.mjs`, `eslint.config.js`, `vitest.workspace.ts`
- Create: `.npmrc`, `.nvmrc`, `.gitignore`, `.changeset/config.json`
- Create: `scripts/check-workspace.mjs`

- [ ] **Step 1: Write the failing metadata check**

```js
import { readFile } from 'node:fs/promises';
const root = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
if (root.private !== true) throw new Error('root package must be private');
if (root.packageManager !== 'pnpm@10.20.0') throw new Error('pin pnpm 10.20.0');
for (const name of ['build', 'check', 'format', 'lint', 'test', 'typecheck']) {
  if (!root.scripts?.[name]) throw new Error(`missing script: ${name}`);
}
```

- [ ] **Step 2: Verify red state**

Run: `node scripts/check-workspace.mjs`

Expected: failure because `package.json` does not exist.

- [ ] **Step 3: Add root package metadata**

```json
{
  "name": "archwise",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@10.20.0",
  "engines": { "node": ">=22 <25" },
  "scripts": {
    "build": "turbo run build",
    "check": "pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm boundaries",
    "boundaries": "node scripts/check-boundaries.mjs",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run --workspace vitest.workspace.ts",
    "typecheck": "turbo run typecheck"
  }
}
```

Add workspaces `apps/*` and `packages/*`. Configure Turborepo so `build` and `typecheck` depend on upstream packages. Configure TypeScript with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, declarations, and NodeNext resolution. Add pinned development dependencies for the stack listed above.

- [ ] **Step 4: Verify green state**

Run: `corepack enable && pnpm install && node scripts/check-workspace.mjs`

Expected: lockfile created and exit code 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json prettier.config.mjs eslint.config.js vitest.workspace.ts .npmrc .nvmrc .gitignore .changeset scripts/check-workspace.mjs
git commit -m "build: bootstrap TypeScript workspace"
```

## Task 3: Domain and schema packages

**Files:**
- Create: `packages/domain/{package.json,tsconfig.json,src/index.ts,tests/smoke.test.ts}`
- Create: `packages/schemas/{package.json,tsconfig.json,src/index.ts,tests/version.test.ts}`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT_SNAPSHOT_VERSION } from '../src/index.js';
describe('domain contract', () => {
  it('starts with one explicit version', () => expect(CURRENT_SNAPSHOT_VERSION).toBe(1));
});
```

```ts
import { describe, expect, it } from 'vitest';
import { snapshotEnvelopeSchema } from '../src/index.js';
describe('snapshot schema', () => {
  it('rejects unknown versions', () => {
    expect(snapshotEnvelopeSchema.safeParse({ version: 1 }).success).toBe(true);
    expect(snapshotEnvelopeSchema.safeParse({ version: 2 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Verify red state**

Run: `pnpm test`

Expected: missing package/export failures.

- [ ] **Step 3: Implement minimal contracts**

`packages/domain/src/index.ts`:

```ts
export const CURRENT_SNAPSHOT_VERSION = 1 as const;
export type SnapshotVersion = typeof CURRENT_SNAPSHOT_VERSION;
```

`packages/schemas/src/index.ts`:

```ts
import { z } from 'zod';
export const snapshotEnvelopeSchema = z.object({ version: z.literal(1) }).strict();
export type SnapshotEnvelope = z.infer<typeof snapshotEnvelopeSchema>;
```

Expose only built public entry points. Domain has no runtime dependencies; schemas depends only on Zod.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @archwise/domain test && pnpm --filter @archwise/schemas test && pnpm build`

Expected: two tests and both builds pass.

```bash
git add packages/domain packages/schemas pnpm-lock.yaml
git commit -m "feat: establish domain and schema packages"
```

## Task 4: Application and fixture packages

**Files:**
- Create: `packages/application/{package.json,tsconfig.json,src/index.ts,tests/boundary.test.ts}`
- Create: `packages/test-fixtures/{package.json,tsconfig.json,src/index.ts}`

- [ ] **Step 1: Write a failing inward-dependency test**

```ts
import { describe, expect, it } from 'vitest';
import { createApplicationInfo } from '../src/index.js';
describe('application', () => {
  it('reads the domain version', () => expect(createApplicationInfo()).toEqual({ snapshotVersion: 1 }));
});
```

- [ ] **Step 2: Verify red state**

Run: `pnpm --filter @archwise/application test`

Expected: missing export failure.

- [ ] **Step 3: Implement the minimal application API**

```ts
import { CURRENT_SNAPSHOT_VERSION } from '@archwise/domain';
export function createApplicationInfo(): Readonly<{ snapshotVersion: number }> {
  return Object.freeze({ snapshotVersion: CURRENT_SNAPSHOT_VERSION });
}
```

The application package may depend on domain and schemas, never concrete adapters. The private fixture package exports deterministic temporary-workspace and path-normalization helpers only.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @archwise/application test && pnpm typecheck`

Expected: exit code 0.

```bash
git add packages/application packages/test-fixtures pnpm-lock.yaml
git commit -m "feat: add application and fixture foundations"
```

## Task 5: CLI and server shells

**Files:**
- Create: `apps/cli/{package.json,tsconfig.json,src/index.ts,tests/smoke.test.ts}`
- Create: `apps/server/{package.json,tsconfig.json,src/index.ts,tests/smoke.test.ts}`

- [ ] **Step 1: Write failing shell tests**

```ts
expect(formatVersion('0.1.0-dev')).toBe('Archwise 0.1.0-dev (foundation only)');
expect(healthPayload()).toEqual({ name: 'archwise', status: 'foundation' });
```

- [ ] **Step 2: Verify red state**

Run: `pnpm --filter @archwise/cli test && pnpm --filter @archwise/server test`

Expected: missing export failures.

- [ ] **Step 3: Implement only tested functions**

```ts
export function formatVersion(version: string): string {
  return `Archwise ${version} (foundation only)`;
}
```

```ts
export function healthPayload(): Readonly<{ name: 'archwise'; status: 'foundation' }> {
  return Object.freeze({ name: 'archwise', status: 'foundation' });
}
```

Do not start a listener. Fastify belongs to Phase 5, where capability and origin controls ship together.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @archwise/cli test && pnpm --filter @archwise/server test && pnpm build`

Expected: exit code 0.

```bash
git add apps/cli apps/server pnpm-lock.yaml
git commit -m "feat: add CLI and server foundations"
```

## Task 6: Accessible web shell

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html}`
- Create: `apps/web/src/{main.tsx,App.tsx,App.test.tsx,test-setup.ts}`

- [ ] **Step 1: Write a failing semantic UI test**

```tsx
render(<App />);
expect(screen.getByRole('heading', { name: 'Archwise' })).toBeVisible();
expect(screen.getByText('Foundation workspace')).toBeVisible();
```

- [ ] **Step 2: Verify red state**

Run: `pnpm --filter @archwise/web test`

Expected: missing `App` failure.

- [ ] **Step 3: Implement the minimal UI**

```tsx
export function App() {
  return <main><h1>Archwise</h1><p>Foundation workspace</p><p>Architecture discovery is not implemented yet.</p></main>;
}
```

Configure Vite, jsdom, Testing Library, and jest-dom. Do not add React Flow before Phase 5.

- [ ] **Step 4: Verify and commit**

Run: `pnpm --filter @archwise/web test && pnpm --filter @archwise/web build`

Expected: test and build pass.

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: add accessible web foundation"
```

## Task 7: Enforce architecture boundaries

**Files:**
- Create: `.dependency-cruiser.cjs`, `scripts/check-boundaries.mjs`, `scripts/tests/boundaries.test.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write a test that injects `import 'node:fs'` into a temporary domain file**

The test runs the boundary checker, expects a non-zero exit and rule name `domain-no-node`, and removes the temporary file in `finally`.

- [ ] **Step 2: Verify red state**

Run: `node --test scripts/tests/boundaries.test.mjs`

Expected: checker-not-found failure.

- [ ] **Step 3: Implement rules**

Reject Node/framework/database/provider imports from domain; concrete adapters from application; private-entry bypasses; circular package dependencies; and undeclared dependencies. `check-boundaries.mjs` must preserve dependency-cruiser's exit code.

- [ ] **Step 4: Verify red and green behavior**

Run: `node --test scripts/tests/boundaries.test.mjs && pnpm boundaries`

Expected: injected violation rejected, real workspace accepted.

- [ ] **Step 5: Commit**

```bash
git add .dependency-cruiser.cjs scripts package.json pnpm-lock.yaml
git commit -m "test: enforce architecture boundaries"
```

## Task 8: CI and security automation

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/security.yml`
- Modify: `docs/ci-cd.md`

- [ ] **Step 1: Create least-privilege workflows**

Pin every action to a commit SHA. CI installs with `--frozen-lockfile --ignore-scripts`, runs `pnpm check` on Linux, and smoke-builds supported macOS/Windows runners. Security runs CodeQL, dependency review, secret scanning available to the repository, and scheduled dependency audit. Neither workflow calls an AI provider.

- [ ] **Step 2: Validate workflows**

Run: `actionlint .github/workflows/*.yml && pnpm check`

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows docs/ci-cd.md
git commit -m "ci: establish quality and security gates"
```

## Task 9: Contributor onboarding and phase closure

**Files:**
- Create: `docs/development/architecture-boundaries.md`, `docs/development/testing.md`
- Create: `.changeset/foundation.md`
- Modify: `README.md`, `CONTRIBUTING.md`, `docs/implementation-roadmap.md`

- [ ] **Step 1: Document exact prerequisites and commands**

Document Node range, Corepack/pnpm, frozen installation, `pnpm check`, package responsibilities, dependency direction, fixtures, ADR triggers, and reproduction of CI. State prominently that the repository is foundation-only.

- [ ] **Step 2: Rehearse a clean clone**

Run in a new temporary clone:

```bash
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

Expected: all checks pass without undocumented setup.

- [ ] **Step 3: Run final verification**

```bash
actionlint .github/workflows/*.yml
pnpm check
git diff --check origin/main...HEAD
git status --short
```

Expected: all checks exit 0 and status is clean after the final commit.

- [ ] **Step 4: Add changeset and close the phase**

The changeset announces `0.1.0-dev` and explicitly says discovery, graphing, simulation, and coaching are not implemented. Link exit-gate evidence in the roadmap.

- [ ] **Step 5: Commit and open PR**

```bash
git add README.md CONTRIBUTING.md docs/development docs/implementation-roadmap.md .changeset/foundation.md
git commit -m "chore: close foundation phase"
```

The PR must enumerate every exit criterion, verification command, security/privacy impact, public contract, and Phase 2 follow-up. Do not merge with failing or skipped required checks.

## Self-review checklist

- [ ] Every Phase 0/1 roadmap package maps to a task.
- [ ] Domain direction is enforced by a failing test, not convention alone.
- [ ] Shells do not prematurely implement discovery, graphing, or networking.
- [ ] Governance stops rather than guessing legal/contact choices.
- [ ] Commands identify expected red and green states.
- [ ] No task needs a live AI provider or private analyzed repository.
- [ ] Completion requires fresh clean-clone and full-suite evidence.
