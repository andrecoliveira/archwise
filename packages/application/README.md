# @archwise/application

Use cases and ports. Depends only on `@archwise/domain` and `@archwise/schemas`; it never imports concrete adapters or Node APIs.

- **Store ports:** `WorkspaceRepository`, `RevisionRepository` and `SessionRepository`, plus `Clock`, `IdGenerator` and `Digest`.
- **`SessionService`:**
  - records a discovery run as a revision, and reuses the latest revision when the graph fingerprint is unchanged;
  - reserves a fresh session per launch and persists it on its first Sandbox save;
  - lists, resumes (in place), renames and deletes sessions.
- **Analyzer contract** (`analyzer.ts`): `Analyzer`, `Fact`, `CoverageGap`, `PackageFact` and the strict `isFact` validator. An analyzer outside the core needs only these types.
- **`runAnalyzers`:** runs analyzers per repository in ID order, with time and file budgets, and isolates failures. `analysisInputs` groups the inventory per repository for it.
- **`resolveArchitecture`:** merges the inventory and analyzer facts into the view graph v2 (roles, Compose links, technology merging, ambiguity diagnostics, gaps).
- **`inspectSandboxText`:** an envelope check for `archwise-sandbox` v1 documents, limited to 256 KiB.
- **`createMemoryStore`:** an in-memory adapter.
- **`@archwise/application/testing`:** exports `defineStoreContract`, the behavioral contract that every store adapter runs (memory here; SQLite in `@archwise/storage`).

Public exports live in `src/index.ts` and `src/testing/index.ts`. Tests live in `tests/`. Run `pnpm --filter @archwise/application test` from the root, after `pnpm build`.
