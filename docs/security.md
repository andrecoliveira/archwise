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

## Vulnerability response

Before public release, add `SECURITY.md` with a private reporting channel, supported versions, disclosure expectations, and response targets. Security reports must not be filed as public issues when they contain exploit details or secrets.

## Out-of-scope guarantees

Archwise cannot prove a repository is safe, guarantee detection of all secrets, or replace sandboxing for intentionally executing untrusted projects. The UI and documentation must avoid implying otherwise.
