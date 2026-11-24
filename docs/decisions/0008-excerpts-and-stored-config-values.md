# ADR 0008: Evidence excerpts and stored configuration values

- Status: Accepted
- Date: 2026-11-24
- Owner decision: 2026-11-23, option A (store Compose properties). See the [Studio redesign spec](../superpowers/specs/2026-11-23-studio-redesign-design.md), §5.11, §6.2 and §12.2.

## Context

The Studio redesign promises that a person can see *why* Archwise believes each claim. Two things need content from the analyzed repository that the graph did not carry before:

- **Configuration values** that a component's Details tab shows: a Compose service's image, build context, published ports and `depends_on`.
- **The lines an evidence item cites,** shown on demand with "Show lines".

Until now, Archwise had a simple rule: file contents never reach the graph, the store, the API or `--json`. Both features break that rule in a controlled way. This ADR records where the new line is drawn.

## Decision

### Stored configuration values

- **A closed allowlist.** The Docker Compose analyzer keeps the values of exactly four keys per service:
  - `image`;
  - `build`: the context only;
  - `ports`: published host and container numbers only. Interpolated parts are dropped;
  - `depends_on`: service names.
- **Never read.** It never reads `environment`, `env_file`, `command`, `entrypoint`, `labels`, `secrets` or `configs`.
- **Masked twice.** Each value is masked with `maskConfigValue` (`@archwise/domain`) by the analyzer, and again by the resolver. Masking covers:
  - everything `redactSensitiveText` already masks;
  - credentials in URLs (`scheme://user:pass@`);
  - the value of any key whose name contains `password`, `passwd`, `secret`, `token` or `key`.
- **Where values live.** Values are view-graph `properties`, each with line-level evidence. So they are stored in sessions and appear in `--graph`. The `archwise.graph` v1 revision format does not carry them.
- **The security statement** becomes: "The graph stores only this closed list of configuration values, masked. It never stores environment variables, commands or source content."

### Evidence excerpts

`GET /api/v1/evidence/excerpt/<id>` returns a read-only excerpt only when **all** of these hold:

1. **Known identifier.** The id names an evidence item of the **latest scan**. The id is the sha256 of the absolute root, path, rule and line range. It lives only in the server's memory and in the served graph, and is never stored. The server never takes a path from the browser.
2. **Root known.** The item's root is known: the component's own repository, or the only root that holds that path. Ambiguous items get no id.
3. **Clean path.** The path is relative, has no `.` or `..` segments, and no segment between the root and the file is a symbolic link.
4. **Not denied.** The file is not on the discovery deny list (`.env*`, keys, `.npmrc`, `.netrc`, `.ssh`, `.aws`, `.gnupg`).
5. **Short range.** The range is at most 40 lines. A whole-file item shows its first 40 lines.
6. **Small enough.** The file is no larger than the inventory's per-file budget (1 MiB).
7. **Unchanged and readable.** The file's sha256 still equals the scan's, and it is valid UTF-8. A file that changed shows a "changed since scan" notice instead of lines.

Every returned line passes through `maskConfigValue`. Responses carry `Cache-Control: no-store`. Excerpts are never cached, logged, stored in sessions or included in exports. The route requires the local session cookie, like every API route.

In a resumed historical session, the Studio offers "Show lines" only for evidence whose identifier also exists in the latest scan.

## Consequences

- **The statement changes.** "File contents never reach the graph" no longer holds as written. `docs/security.md` now states the narrower guarantee and lists every excerpt check.
- **Masking errs towards hiding.** A value such as `keywords: [...]` is masked because its key contains `key`. That is the accepted cost of a simple, auditable rule.
- **Ids depend on the latest scan.** The server must re-scan before it can show lines for files that changed. That is the intended behavior: excerpts never show content the graph did not see.
- **One more file-reading path.** The local server gains it, bounded by the checks above and covered by server tests for each check.

## Rejected alternatives

- **Reading Compose properties live at request time:** this would add a second file-reading path, and Details would be empty in resumed sessions.
- **Excerpts keyed by path:** this would turn the server into a file reader for any path in the root, and make the deny list the only defense.
- **Caching excerpts in the session store:** this would persist source content outside the repository.
- **Following symlinks that stay inside the root:** a check-then-read race could escape the root. Refusing every link is simpler, and the walker never follows links anyway.
