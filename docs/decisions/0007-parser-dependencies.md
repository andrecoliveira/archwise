# ADR 0007: Parser dependencies for architecture discovery

- Status: Accepted
- Date: 2026-11-23

## Context

Phase 4 turns the safe file inventory into an architecture graph (see the [Phase 4 spec](../superpowers/specs/2026-11-23-architecture-discovery-design.md)). Two input formats need real parsers:

- **YAML,** for Docker Compose files and `pnpm-workspace.yaml`;
- **TypeScript and JavaScript syntax,** for source analysis in Phase 4 PR 2.

Both parsers handle untrusted input from analyzed repositories. Neither the Node standard library nor an existing dependency parses either format.

## Decision

- **`yaml` (exact version 2.9.1), from Phase 4 PR 1,** used only by `@archwise/analyzers`.
  - It has no dependencies and is pure JavaScript.
  - It parses the YAML 1.2 core schema and does not execute custom tags.
  - Archwise calls `parseDocument` with `schema: 'core'`, `uniqueKeys: true` and `maxAliasCount: 100`. A document with any error or warning is treated as invalid and becomes an `invalid-syntax` coverage gap.
  - Compose `${…}` interpolation is never resolved.
- **`typescript`, from Phase 4 PR 2,** promoted from a dev dependency to a runtime dependency of `@archwise/analyzers`.
  - Only the parser API (`createSourceFile`) is used. There is no program, type checker, `tsconfig` loading or module resolution.
  - It is already in the toolchain, is pure JavaScript with no native binaries, and parses TS, TSX, JS and JSX exactly.

## Consequences

- **Install size grows.** `typescript` is large. That is acceptable for a local developer tool, and it avoids native install steps on every CI platform.
- **Versions are pinned exactly.** Upgrades go through Renovate and the dependency review gate, like every other dependency.
- **Contract tests pin the parser behaviour Archwise relies on:**
  - alias limits and duplicate keys for YAML;
  - invalid syntax and partial results for source analysis.

## Rejected alternatives

- **`js-yaml`:** its default schema is broader than the core schema, and it offers fewer document-level error controls.
- **A hand-written YAML subset:** YAML edge cases (anchors, merge keys, multi-line scalars) are a known source of parser security bugs.
- **`@babel/parser`:** a second JavaScript toolchain next to TypeScript, with no advantage for syntax-only parsing.
- **`oxc-parser` and `@swc/core`:** fast, but they ship native binaries per platform and ABI.
