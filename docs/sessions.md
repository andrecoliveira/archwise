# Sessions and the local store

Each time you launch the Studio on a project, Archwise starts a **fresh session**: the graph discovered now, plus an empty Sandbox. Sessions are saved in a local store outside your project, so earlier work can be listed and resumed, much like `/resume` in a chat tool.

## In the Studio

- **Autosave.** Every Sandbox change saves to the current session about 750 ms after you stop editing. The header indicator shows **All changes saved**, **Saving…**, or **Not saved — retrying on next change**, which offers a **Retry** button. Pending changes are also saved when you leave or hide the page. This is best effort: browsers only allow it for Sandbox documents up to about 60 KB, so larger documents rely on the normal 750 ms autosave. A failed save never discards what is on the canvas.
- **Reload.** Reloading the page restores the current session from the store.
- **Sessions.** The **Sessions** button lists this project's saved sessions, newest first. Each entry shows its name, its component count, an `A/B` badge when it has scenario snapshots, and an **Architecture changed** badge when discovery differs from the session's start. From the list you can:
  - **Resume** a session, which continues it in place;
  - **Rename** it;
  - **Delete** it, after a confirmation;
  - start a **New session**.

  Deleting the session you have open switches to a fresh, empty session.

- **Changed architecture.** A resumed session shows the graph **as it was** when the session started, with a notice and a button to start a new session on the current graph. Re-applying an old Sandbox onto a newer graph (rebase) is future work.
- **One active tab per session.** Two tabs editing the same session overwrite each other: the last save wins, with no warning. If another tab or process deletes the session, saving stops with **This session was deleted elsewhere. Reload to continue.** Your edits stay on the canvas, so you can export them as JSON before reloading.
- **Unrestorable sessions.** If a saved Sandbox cannot be restored (for example, it was written for a different project), the Studio stops saving so the stored copy is never overwritten. Start a new session from **Sessions**.
- **Switching safely.** Refresh, resume and new-session first save pending edits. If that save fails, the switch is cancelled so nothing is lost.
- **`--no-store`.** The indicator shows **Not saving (store disabled)** and the Sessions button is hidden. JSON export and import still work.

The Studio no longer keeps Sandbox state in browser `localStorage`. A Sandbox that lived only in an older build's browser storage can be moved over with **Export JSON** in that build, then **Import JSON** here.

## What is stored, and where

| Platform | Directory                                               |
| -------- | ------------------------------------------------------- |
| macOS    | `~/Library/Application Support/Archwise`                |
| Linux    | `$XDG_DATA_HOME/archwise`, or `~/.local/share/archwise` |
| Windows  | `%LOCALAPPDATA%\Archwise`                               |

Set `ARCHWISE_DATA_DIR` to use another directory. The store is a single SQLite file, `archwise.db`, which holds the following:

- **Workspaces:** the identity of each project. For one root it is the absolute root path. For several repositories (`--repo` more than once, or `--workspace`) it is the sorted list of their absolute paths, so adding or removing a repository starts a different session history. No schema change was needed for this. Repository labels are now made unique, so a single-root project whose nested repositories share a name (for example two submodules called `lib`) records one new revision after the upgrade, and a resumed session shows the "architecture changed" notice once.
- **Graph revisions:** the discovered package graph as an `archwise.graph` v1 revision, plus the Studio's view of it. An unchanged rescan reuses the previous revision instead of adding a new one. A rescan counts as changed when either the graph or its view differs, for example a new framework label.
- **Sessions:** the Sandbox document, a label, and creation and update times. Each session records the revision it started from.
- **Scans:** for each `--serve` or `--sessions` run, the start and finish times, counts per skip reason, truncation and analyzer versions. A scan record holds counts and codes only, never paths. `--json` and `--graph` never open the store. Schema version 2 added this table. Upgrading from version 1 takes a backup first.

Archwise never writes inside the analyzed project. The API never returns the absolute root path. To remove all saved data, delete the directory.

## Commands

```bash
node apps/cli/dist/bin.js --sessions --path /absolute/path/to/project   # list saved sessions, newest first
node apps/cli/dist/bin.js --serve --path /absolute/path/to/project      # Studio with the store enabled
node apps/cli/dist/bin.js --serve --resume latest --path /absolute/path/to/project   # continue the newest session
node apps/cli/dist/bin.js --serve --resume ses-… --path /absolute/path/to/project    # continue a specific session
node apps/cli/dist/bin.js --serve --no-store --path /absolute/path/to/project   # run without saving anything
```

Each line of `--sessions` shows, in order:

- when the session last changed;
- its label (by default `Sandbox · N components`);
- its component count;
- `A/B` if it has saved scenario snapshots;
- `changed` if the project's discovered architecture changed since the session started;
- the session ID.

A final `Last scan: <time>` line shows when the project was last scanned.

Listing runs a discovery to compute the `changed` flag, so a changed project records a new revision.

A session is saved only after its first Sandbox change. Launches where nothing changed leave no entry. `--resume` exits with code 2 and a hint to run `--sessions` when no saved session matches; it cannot be combined with `--no-store`.

## Session API (loopback, capability-protected)

The Studio uses these endpoints. All of them require the local session cookie. Mutations (`PUT`, `PATCH`, `POST`, `DELETE`) also require a same-origin `Origin` header. `PUT` and `PATCH` also require a JSON body.

| Method and path                     | Purpose                                                                           |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/v1/sessions/current`      | The current session ID, whether it is persisted, and whether the store is enabled |
| `GET /api/v1/sessions`              | Session summaries for this project                                                |
| `GET /api/v1/sessions/{id}`         | Sandbox document, base revision view, and whether that revision is still current  |
| `POST /api/v1/sessions/{id}/resume` | Continue that session in place (later saves update it)                            |
| `PUT /api/v1/sessions/{id}/sandbox` | Save the Sandbox; the first save persists a fresh session                         |
| `POST /api/v1/sessions/new`         | Reserve a fresh, empty current session                                            |
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
