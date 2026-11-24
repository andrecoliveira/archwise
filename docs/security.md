# Security and privacy

## Threat model

Archwise analyzes untrusted repositories that may contain malicious files, oversized inputs, symlink traps, parser exploits, prompt injection, and secrets. It also exposes a local web service and may connect to model providers. These are trust boundaries, even on a single-user machine.

## Default controls

- Static inspection only; do not execute build scripts, project binaries, package hooks, containers, templates, or application imports.
- Open files with size, type, count, depth, and time budgets; isolate expensive parsers in workers with cancellation and memory limits.
- Canonicalize roots and reject path traversal. Do not follow symlinks outside registered roots.
- Bind the API to loopback. Require a high-entropy session capability, validate `Origin`/`Host`, use restrictive CORS, and set a strict Content Security Policy.
- **The Studio loads nothing remote.**
  - Its font (JetBrains Mono, SIL OFL 1.1) and its icon ship with the app.
  - The Content Security Policy keeps `default-src 'none'`. Scripts, fonts and connections are allowed only from `'self'`, and images from `'self'` and `data:`.
  - Styles are allowed from `'self'` and also `'unsafe-inline'`, because Svelte Flow and Svelte `style:` directives set inline styles. No inline scripts are allowed.
  - The browser smoke test fails if the Studio requests anything outside its own local server.
- Give the browser opaque workspace IDs, never arbitrary filesystem APIs.
- Escape all repository-derived labels and render untrusted Markdown without raw HTML.
- Redact common credential patterns and sensitive filenames before persistence, logs, exports, or provider context.
- Disable telemetry by default. If introduced, make it opt-in, documented, inspectable, and free of file paths or graph content.

## Local store

The local SQLite store ([ADR 0006](decisions/0006-local-store-node-sqlite.md)) lives in the user's application-data directory, which is created with mode `0700` on POSIX. It holds:

- absolute workspace root paths (several, for a multi-repository workspace);
- discovered package names and manifest-relative paths;
- the closed list of Compose configuration values, masked (see below);
- Sandbox documents.

It never contains source file contents, environment variables or commands. It is not synchronized or exported, and the API never returns root paths. Session routes require the local session capability. Mutations also require a same-origin `Origin` header, a JSON content type and a body under 300,000 bytes. Users can delete the directory to remove all stored data.

## Safe scanning

The inventory lists files with `lstat`. It never follows symlinks, so a link cannot lead it outside a root or into a cycle. It never opens sockets, FIFOs or devices. It reads `package.json` manifests, `.gitignore` files and the files the built-in analyzers declare (Compose files, `pnpm-workspace.yaml`, Prisma schemas, and Nx and Lerna configuration names, which are only reported as unsupported). All of these share a per-file and a total byte budget. Whatever an analyzer declares, discovery never reads `.env` or `.env.*` files, `*.pem`, `*.key`, `id_rsa*`, `.npmrc`, `.netrc`, or anything under `.ssh/`, `.aws/` or `.gnupg/`.

Analyzers are pure functions over text. A boundary rule forbids Node built-ins in `@archwise/analyzers`, so they cannot open files, the network or processes. YAML is parsed as data (core schema, unique keys, at most 100 aliases), and Compose interpolation is never resolved. The Docker Compose analyzer reads only `image`, `build`, `ports` and `depends_on`: `environment`, `env_file`, `secrets`, `configs`, `labels`, `command` and `entrypoint` are never looked at. The Prisma analyzer reads only the `provider` literal of a `datasource`, never its connection `url`.

The graph stores only this closed list of configuration values, masked. It never stores environment variables, commands or source content. The values are a Compose service's image, build context, published ports (host and container numbers only) and `depends_on` names, kept as view-graph properties with their line evidence ([ADR 0008](decisions/0008-excerpts-and-stored-config-values.md)). Each value is masked twice, once in the analyzer and once in the resolver. Image and build values lose payment API keys, bearer tokens, credentials in URLs and the patterns of [Secret handling](#secret-handling), and keep their name and tag. Ports and `depends_on` also lose the value of any key named like a password, secret, token, key, auth, credential, private key or DSN, and the argument of a flag named like one. These values appear in the view graph, in sessions and in `--graph`. They do not appear in the `archwise.graph` revision format or in `--json`. See [Discovery](discovery.md#architecture-analyzers). Ignore patterns are matched without regular expressions, so a hostile `.gitignore` cannot stall a scan. See [Discovery](discovery.md#safe-inventory).

## Evidence excerpts

The Studio's "Show lines" reads the lines an evidence item cites, through `GET /api/v1/evidence/excerpt/<id>` ([ADR 0008](decisions/0008-excerpts-and-stored-config-values.md)). The server returns lines only when every check passes, in this order:

1. **Known id.** The id is one the server computed for an evidence item of its latest scan: a sha256 of root, path, rule and line range, held in memory. The browser never sends a path.
2. **Clean path.** It is relative, with no empty, `.` or `..` segments, no drive letter and no backslash.
3. **Not denied.** It is not on the discovery deny list (see [Safe scanning](#safe-scanning)).
4. **Short range.** The cited range is at most 40 lines. A whole-file item shows its first 40 lines.
5. **No links.** No path segment from the root to the file is a symbolic link (checked with `lstat`), and the file is a regular file.
6. **Small enough.** The file is no larger than the inventory's per-file budget (1 MiB).
7. **Text.** The file decodes as UTF-8, strictly. This is checked before the hash, so a file that was never valid UTF-8 reads as "not UTF-8", not as "changed".
8. **Unchanged.** The file's sha256 still equals the one the scan recorded. Otherwise the response says "changed" and returns no lines.
9. **Masked and bounded.** Every returned line is masked like a Compose value (keys and flags named like secrets, URL credentials, bearer tokens, payment keys and the patterns of [Secret handling](#secret-handling)). The continuation lines of a YAML block scalar that a secret-named key opens are masked too, even when the block starts above the cited range. Lines split on `\n`, `\r\n` or `\r`, and each shown line is cut at 400 characters after masking, so a minified file cannot return one huge line. The response lists the cut lines (`truncatedLines`), and the Studio says which ones were cut and how to open them in an editor.

An evidence item whose repository cannot be determined in a multi-root workspace gets no id. In a resumed historical session, the Studio reuses an id only for the same component citing the same item in the latest scan. So the Studio never shows lines from the wrong repository. Responses use `Cache-Control: no-store`. Excerpts are never logged, stored in sessions or exported. The route requires the local session cookie and refuses query strings, like every API route.

A workspace file may point at any directory the user chooses, including outside its own folder. Safety does not depend on where roots point: the scan never reads outside its roots and never writes in them, and a workspace-file entry that resolves to a filesystem root is rejected. Archwise never creates or changes a workspace file.

## Redaction at the discovery boundary

Text read from analyzed manifests (package and dependency names) is untrusted. Before it reaches the graph, the store, the API or any output, the CLI inventory:

- replaces known secret shapes with `[redacted]`, removing the whole token (a private-key block up to its end marker, a JWT including its signature);
- replaces home directories with `~`: the running user's real home directory, plus the generic `/Users/<name>` and `X:\Users\<name>` shapes;
- repeats until nothing changes, so removing one piece cannot reassemble another.

The `archwise.graph` validator rejects labels that still contain a secret shape or a generic home-directory shape. Linux `/home/<name>` is redacted only for the running user, because route labels such as `/home/feed` share its shape. `--json` and `--graph` output use repository-relative paths and never print the absolute workspace root. Directory names are not redacted: a directory named like a secret appears in evidence paths, and the graph validator then rejects that revision, so sessions are not saved for that run.

Tests cover the domain primitives and validation, the inventory adapter, and the built CLI output.

Pattern matching is defense in depth. It does not prove that text is free of sensitive data.

## Secret handling

Archwise inventories the existence of sensitive configuration only when useful; it does not read `.env` values, private keys, credential directories, or known secret files by default. Provider keys live in the OS credential store where supported. Diagnostic bundles require preview and explicit export, with a second redaction pass.

## Remote providers

Remote transmission is deny-by-default. Enabling a provider does not enable source sharing. Each provider adapter documents endpoint, retention assumptions, supported data controls, and exact data categories sent. Enterprise proxies and local endpoints are configuration choices, not separate core behavior.

## Supply chain

- Commit lockfiles and use reproducible builds.
- Pin GitHub Actions to immutable commit SHAs.
- Run dependency, license, secret, and static-analysis scans in CI.
- Generate SBOMs and signed checksums for releases; adopt artifact provenance as the release pipeline matures.
- Require review for changes to parsers, provider boundaries, persistence migrations, export formats, and local-server security.

## Accepted dependency risks

Each accepted advisory has a rationale, an owner and an exit condition. CI fails on moderate or higher audit findings, and dependency review blocks pull requests that introduce them.

| Advisory | Package and path | Severity | Rationale | Exit condition | Owner |
|---|---|---|---|---|---|
| [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) | `deepmerge` 4.3.1, via `@sveltejs/vite-plugin-svelte` (web devDependency) | Low | Build-time only. The plugin merges its own configuration, never untrusted input, and the code is not shipped in the analyzed-repository path. No patched version exists (accepted 2026-11-15). | Upgrade when a patched `deepmerge` or a plugin release without it is available | Maintainer |

## Vulnerability response

[`SECURITY.md`](../SECURITY.md) defines the private reporting channel (GitHub Private Vulnerability Reporting), supported versions, disclosure expectations and response targets. Security reports must not be filed as public issues when they contain exploit details or secrets.

## Out-of-scope guarantees

Archwise cannot prove a repository is safe, guarantee detection of all secrets, or replace sandboxing for intentionally executing untrusted projects. The UI and documentation must avoid implying otherwise.
