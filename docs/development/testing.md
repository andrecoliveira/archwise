# Foundation development

Use Node 26 (see `.nvmrc`) and pnpm 10.34.9. Node 24 is also targeted by CI.

Install the pinned package manager using your normal package-manager setup, or invoke `npx --yes pnpm@10.34.9`. Installing dependencies needs network access unless cached.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

`pnpm check` runs formatting, dependency-ordered builds, lint, strict type checking, architecture checks, and tests. Build comes before tests because application imports domain through its public built entry point and CLI smoke tests execute the compiled binary. For focused tests, first run `pnpm build`, then `pnpm --filter @archwise/schemas test`. `pnpm test:integration` runs checker/process regressions after building.

Tests cover envelope versions/unknown fields, immutable metadata, safe fixture paths/disposal, CLI arguments and exit codes, a semantic React page, and architectural violations in synthetic workspaces. Full graph workflows and real-browser E2E testing belong to later phases.

Packages are private during bootstrap. They expose ESM code and declarations under `dist`. Generated output, dependencies and build cache are ignored. Each package README describes its responsibility.

Formatting covers tooling, packages, apps, scripts and CI; historical specifications and canonical license text are excluded. `pnpm lint` uses type-aware rules on production TypeScript. `pnpm boundaries` enforces the [dependency rules](architecture-boundaries.md). `pnpm changeset status` previews release notes without publishing.

Run `node apps/cli/dist/bin.js --help` after building. Run `pnpm dev` to serve the React foundation page on loopback. This development server is not the future authenticated local application API. No repository scanning occurs.

`pnpm audit --audit-level moderate` checks registry advisories and requires network access. Security CI also scans Git history with Gitleaks, with redaction enabled and comments/uploads disabled. CodeQL and GitHub dependency-review are not active; see ADR 0004 for the private-repository constraint.

CI defines Linux, macOS and Windows checks on Node 24/26. Local success alone is not evidence that all matrix jobs pass.
