# Sessions and the local store

Each time you launch the Studio on a project, Archwise starts a **fresh session**: the graph discovered now, plus an empty Sandbox. Sessions are saved in a local store outside your project, so earlier work can be listed and resumed, much like `/resume` in a chat tool.

> **Status:** the store, the session API and `--sessions` are implemented. The Studio does not use them yet: it still keeps the Sandbox in browser `localStorage` (see [Sandbox persistence](sandbox-persistence.md)). Autosave, the session list in the Studio, `--resume`, and the changed-architecture notice come in the next increment.

## What is stored, and where

| Platform | Directory                                               |
| -------- | ------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Archwise`                |
| Linux    | `$XDG_DATA_HOME/archwise`, or `~/.local/share/archwise` |
| Windows  | `%LOCALAPPDATA%\Archwise`                               |

Set `ARCHWISE_DATA_DIR` to use another directory. The store is a single SQLite file, `archwise.db`, which holds the following:

- **Workspaces:** the absolute project root path that identifies each project.
- **Graph revisions:** the discovered package graph as an `archwise.graph` v1 revision, plus the Studio's view of it. An unchanged rescan reuses the previous revision instead of adding a new one. A rescan counts as changed when either the graph or its view differs, for example a new framework label.
- **Sessions:** the Sandbox document, a label, and creation and update times. Each session records the revision it started from.

Archwise never writes inside the analyzed project. The API never returns the absolute root path. To remove all saved data, delete the directory.

## Commands

```bash
node apps/cli/dist/bin.js --sessions --path /absolute/path/to/project   # list saved sessions, newest first
node apps/cli/dist/bin.js --serve --path /absolute/path/to/project      # Studio with the store enabled
node apps/cli/dist/bin.js --serve --no-store --path /absolute/path/to/project   # run without saving anything
```

Each line of `--sessions` shows, in order:

- when the session last changed;
- its label (by default `Sandbox · N components`);
- its component count;
- `A/B` if it has saved scenario snapshots;
- `changed` if the project's discovered architecture changed since the session started;
- the session ID.

Listing runs a discovery to compute the `changed` flag, so a changed project records a new revision.

A session is saved only after its first Sandbox change. Launches where nothing changed leave no entry.

## Session API (loopback, capability-protected)

The Studio will use these endpoints. All of them require the local session cookie. Mutations (`PUT`, `PATCH`, `POST`, `DELETE`) also require a same-origin `Origin` header. `PUT` and `PATCH` also require a JSON body.

| Method and path                     | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/v1/sessions/current`      | The current session ID, whether it is persisted, and whether the store is enabled |
| `GET /api/v1/sessions`              | Session summaries for this project                                                |
| `GET /api/v1/sessions/{id}`         | Sandbox document, base revision view, and whether that revision is still current  |
| `POST /api/v1/sessions/{id}/resume` | Continue that session in place (later saves update it)                            |
| `PUT /api/v1/sessions/{id}/sandbox` | Save the Sandbox; the first save persists a fresh session                         |
| `PATCH /api/v1/sessions/{id}`       | Rename (`{"label": "..."}`)                                                       |
| `DELETE /api/v1/sessions/{id}`      | Delete a session                                                                  |

Error responses:

- Unknown or malformed IDs return `404`, and the response never repeats the ID.
- Oversized documents return `413` (the limit is 256 KiB of Sandbox JSON).
- Invalid Sandbox documents and labels return `422`.

## Recovery and failures

| Situation                                  | What Archwise does                                                                                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Corrupt store file                         | It renames the file and its `-wal`/`-shm` companions to `archwise.db.corrupt-<timestamp>`, starts a fresh store, and prints where the old file is. |
| Upgrade to a new store schema              | It backs up to `archwise.db.backup-v<old>-<timestamp>` first and keeps the three newest backups (by schema version, then time).                    |
| Store written by a newer Archwise          | It exits with code 2 and leaves the file untouched. Upgrade Archwise, or use `--no-store`.                                                         |
| Failed upgrade                             | It rolls back and exits with code 2. The file is unchanged and the backup is kept.                                                                 |
| Data directory or store file not writable  | It exits with code 2. Fix the permissions or set `ARCHWISE_DATA_DIR`.                                                                              |
| Data directory inside the analyzed project | It disables the store for that run and prints a notice. Nothing is written in the project.                                                         |

Two Archwise processes can use the store at the same time, including on first use, when both may try to create or upgrade it. Each waits up to 5 seconds for the other's lock. When both save the same session, the last write wins.

See [ADR 0006](decisions/0006-local-store-node-sqlite.md) for the design decision.
