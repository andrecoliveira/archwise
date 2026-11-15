# @archwise/application

Use cases and ports. Depends only on `@archwise/domain` and `@archwise/schemas`; it never imports concrete adapters or Node APIs.

- **Store ports:** `WorkspaceRepository`, `RevisionRepository` and `SessionRepository`, plus `Clock`, `IdGenerator` and `Digest`.
- **`SessionService`:**
  - records a discovery run as a revision, and reuses the latest revision when the graph fingerprint is unchanged;
  - reserves a fresh session per launch and persists it on its first Sandbox save;
  - lists, resumes (in place), renames and deletes sessions.
- **`inspectSandboxText`:** an envelope check for `archwise-sandbox` v1 documents, limited to 256 KiB.
- **`createMemoryStore`:** an in-memory adapter.
- **`@archwise/application/testing`:** exports `defineStoreContract`, the behavioral contract that every store adapter runs (memory here; SQLite in `@archwise/storage`).

Public exports live in `src/index.ts` and `src/testing/index.ts`. Tests live in `tests/`. Run `pnpm --filter @archwise/application test` from the root, after `pnpm build`.
