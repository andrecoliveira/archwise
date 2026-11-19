# ADR 0006: Local store on built-in `node:sqlite`

- Status: Accepted
- Date: 2026-11-16

## Context

Archwise must persist discovered graph revisions and Sandbox sessions so a user can start each launch fresh and later resume an earlier session (see the [sessions spec](../superpowers/specs/2026-11-16-sessions-and-local-store-design.md)). The architecture already named SQLite as the local index, stored outside analyzed repositories, with transactional, backed-up migrations. A driver had not been selected.

## Decision

- **Driver.** Use Node's built-in `node:sqlite` (`DatabaseSync`, plus the async `backup()`) in a new `@archwise/storage` package that implements the application store ports. On Node 24 and 26 it needs no flag and prints no warning (verified on 24.22 and 26.4).
- **Location.** Keep one database file, `archwise.db`, in the OS application-data directory:
  - macOS: `~/Library/Application Support/Archwise`
  - Linux: `$XDG_DATA_HOME/archwise` or `~/.local/share/archwise`
  - Windows: `%LOCALAPPDATA%\Archwise`
  - `ARCHWISE_DATA_DIR` overrides the default. The directory is created with mode `0700` on POSIX.
- **Concurrency.** Use WAL with a 5-second busy timeout, so two Archwise processes can share the file.
- **Integrity.** Check integrity on open. A corrupt file is quarantined (renamed, never deleted).
- **Migrations.** Before migrating, take a backup and keep the newest three. Migrations run in one transaction. A store written by a newer Archwise is refused unchanged.
- **Data placement.**
  - Revisions are stored as canonical `archwise.graph` JSON.
  - The Studio's view graph is stored next to each revision.
  - Sessions store `archwise-sandbox` v1 text.
  - Scan records (schema v2) store counts and codes only.
  - Absolute workspace root paths exist only in this local file. They are never returned by the API or exported.

## Consequences

- **No new npm dependency and no native build step.** Packaging stays simple on all three operating systems.
- **The store is synchronous.** That suits its use: small rows on a single-user loopback server. A long scan must not hold write transactions.
- **Schema changes are append-only migrations,** each covered by tests for backup, rollback and refusal.
- **The store holds paths and Sandbox content.** `docs/security.md` documents its location and permissions, and users can delete the directory to remove all Archwise data.

## Rejected alternatives

- **`better-sqlite3`:** mature and fast, but a native addon. It needs prebuilt binaries per platform and Node ABI, and it adds a dependency with install scripts. The project installs with `--ignore-scripts`.
- **JSON files per session:** simple, but no atomic multi-record updates, no safe concurrent writers, and hand-rolled migrations.
- **Browser IndexedDB or localStorage:** the Studio binds a random loopback port on every launch, which changes the browser origin and so makes earlier storage unreachable. It also cannot be listed from the CLI.
