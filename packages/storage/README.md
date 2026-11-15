# @archwise/storage

Local SQLite store, built on Node's built-in `node:sqlite`. It implements the `@archwise/application` store ports (workspaces, revisions and sessions).

- `resolveDataDir(env, platform, home)` returns the OS application-data directory:
  - macOS: `~/Library/Application Support/Archwise`
  - Linux: `$XDG_DATA_HOME/archwise`, else `~/.local/share/archwise`
  - Windows: `%LOCALAPPDATA%\Archwise`
  - `ARCHWISE_DATA_DIR` overrides all of these. The store never writes inside analyzed repositories.
- `openStore(dataDir)` opens `archwise.db` (directory mode `0700`). It:
  1. runs an integrity check through a read-only connection; a corrupt file and its `-wal`/`-shm` companions are renamed to `archwise.db.corrupt-<timestamp>` and a fresh store starts;
  2. refuses files from a newer Archwise (`newer-schema`);
  3. backs up the file before migrating, to `archwise.db.backup-v<from>-<timestamp>`, keeping the three newest backups;
  4. applies migrations in one transaction; on failure it rolls back, leaves the file unchanged and reports `migration-failed`;
  5. enables WAL. Every connection sets a 5-second busy timeout before any other work, so processes can share the file even while it is being created or migrated.
- Revisions are stored as canonical `archwise.graph` JSON and read back through the strict importer. Sessions store `archwise-sandbox` v1 text.

The store contains absolute workspace root paths and Sandbox content. It is local-only and is never exported or returned by the API.

Tests run the shared store contract from `@archwise/application/testing` against SQLite, plus lifecycle tests for migrations, backups, quarantine, refusal cases and two-handle concurrency. Run `pnpm --filter @archwise/storage test` after `pnpm build`.
