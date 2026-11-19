# Security and privacy

## Threat model

Archwise analyzes untrusted repositories that may contain malicious files, oversized inputs, symlink traps, parser exploits, prompt injection, and secrets. It also exposes a local web service and may connect to model providers. These are trust boundaries, even on a single-user machine.

## Default controls

- Static inspection only; do not execute build scripts, project binaries, package hooks, containers, templates, or application imports.
- Open files with size, type, count, depth, and time budgets; isolate expensive parsers in workers with cancellation and memory limits.
- Canonicalize roots and reject path traversal. Do not follow symlinks outside registered roots.
- Bind the API to loopback. Require a high-entropy session capability, validate `Origin`/`Host`, use restrictive CORS, and set a strict Content Security Policy.
- Give the browser opaque workspace IDs, never arbitrary filesystem APIs.
- Escape all repository-derived labels and render untrusted Markdown without raw HTML.
- Redact common credential patterns and sensitive filenames before persistence, logs, exports, or provider context.
- Disable telemetry by default. If introduced, make it opt-in, documented, inspectable, and free of file paths or graph content.

## Local store

The local SQLite store ([ADR 0006](decisions/0006-local-store-node-sqlite.md)) lives in the user's application-data directory, which is created with mode `0700` on POSIX. It holds:

- absolute workspace root paths;
- discovered package names and manifest-relative paths;
- Sandbox documents.

It never contains source file contents. It is not synchronized or exported, and the API never returns root paths. Session routes require the local session capability. Mutations also require a same-origin `Origin` header, a JSON content type and a body under 300,000 bytes. Users can delete the directory to remove all stored data.

## Safe scanning

The inventory lists files with `lstat`. It never follows symlinks, so a link cannot lead it outside a root or into a cycle. It never opens sockets, FIFOs or devices, and it reads only `package.json` manifests and `.gitignore` files, with a per-file and a total byte budget. Ignore patterns are matched without regular expressions, so a hostile `.gitignore` cannot stall a scan. See [Discovery](discovery.md#safe-inventory-implemented-for-a-single-root).

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
