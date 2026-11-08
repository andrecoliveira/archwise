# ADR 0003: Initial workspace toolchain

- Status: Accepted for the initial tooling slice
- Date: 2026-11-08

## Decision

Use pnpm 10.34.9, Turborepo 2.11.10, TypeScript 5.9.3, Vitest 5.1.0 and Prettier 3.9.10 with exact versions and a committed lockfile. TypeScript 5.9 is intentionally retained as a stable baseline; upgrading the compiler major is separate work. Zod 4.6.7 validates runtime envelopes in the schemas adapter.

Target Node 24 and 26. Node 26 is the local development default. Validate both in the CI matrix before claiming cross-platform support. The [Node release table](https://nodejs.org/en/about/previous-releases) identifies supported release lines.

Use ESM, strict NodeNext compilation, explicit public exports, and private packages during bootstrap. Do not publish packages automatically.

Use Vitest projects instead of the historical workspace option in the original plan, following [current Vitest guidance](https://vitest.dev/guide/projects). Build upstream packages before tests so workspace imports exercise declared public entry points.

## Dependencies and responsibilities

pnpm resolves workspace dependencies and reproducible installs. Turborepo orders builds by dependencies. TypeScript checks public contracts. Vitest runs behavioral tests. Zod rejects malformed data at runtime; domain has no runtime dependencies. Prettier checks formatting.

Only domain, schemas, and application are introduced in this slice. CLI, server, web, reusable fixture helpers, linting, boundary enforcement, Changesets and extended security checks remain later foundation tasks.

## Consequences

The foundation is partial. The initial CI checks formatting, build, types and tests on Linux, macOS and Windows for Node 24/26. Repository branch protection must be configured independently. No graph discovery or application server exists yet.
