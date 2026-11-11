# ADR 0004: Foundation quality gates

- Status: Accepted
- Date: 2026-11-09

## Decision

Expand the development workspace to seven private packages: domain, schemas, application, test-fixtures, CLI, server and web. Keep the server as metadata without a listener; introduce transport security with the local API phase. CLI supports help/version only. Web is a React foundation page.

Use ESLint 10 with typescript-eslint for source linting; test/config files receive syntax linting, and package TypeScript checks include tests. Use dependency-cruiser for architectural graph rules and regression-test those rules against temporary synthetic repositories.

Use Vite for the browser build, React Testing Library/jsdom for semantic component tests and a process-level smoke test for the compiled CLI. These checks do not replace real browser E2E testing in later phases.

Changesets tracks intended releases, but all packages remain private and no publication workflow is enabled.

## Supply chain

The audit identified GHSA-g3hv-75wg-m249 in minimatch pulled by ESLint, @eslint/config-array and typescript-eslint. Override the vulnerable range (>=7.0.0 <11.0.1) to minimatch 11.0.1 in pnpm-workspace.yaml. This is an intentional major-version override; lint/build/tests must pass on the supported CI matrix. Remove the override when upstream dependencies adopt patched compatible versions.

Dependency audit fails for moderate or higher findings. Gitleaks scans Git history using an immutable action commit and scanner version 8.30.1; output is redacted, PR comments and artifact uploads are disabled.

CodeQL and GitHub dependency-review integrations remain pending eligibility/configuration for this private repository. Do not claim they are running. See [GitHub code scanning availability](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning). The Gitleaks action works without a license key for this personal account; transferring to an organization requires reviewing its license or replacing the action with the open-source CLI.

## Consequences

`pnpm check` enforces formatting, builds, lint, types, boundaries and tests without calling model providers. CI repeats it across Node 24/26 and Linux/macOS/Windows. Security jobs require network access to retrieve advisory data and scanner releases. These are contributor checks, not product telemetry or analyzed-repository uploads.
