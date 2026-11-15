# CI/CD and releases

## Pull-request checks

### Current state

The following workflows are configured today:
- `ci.yml`: `pnpm check` (format, build, lint, typecheck, boundaries, tests) on Linux/macOS/Windows × Node 24/26, with lockfile install and lifecycle scripts disabled.
- `security.yml`: `pnpm audit --audit-level moderate`, Gitleaks history scanning with redaction, and dependency review on pull requests (fails on moderate or higher).
- `codeql.yml`: CodeQL static analysis of JavaScript/TypeScript and of the workflows themselves, in build-mode `none`; runs on PRs, `main` and weekly.
- `browser-smoke.yml`: a real-Chromium Studio acceptance test on Ubuntu 24.04.

`main` is protected. It requires pull requests, these required checks, and resolved conversations:
- the six `check` matrix jobs;
- `dependencies`, `secrets` and `dependency-review`;
- CodeQL `analyze`.

The path-filtered browser smoke is not required, because it does not run on every PR.

Not yet configured: coverage thresholds, the offline end-to-end immutability check, and a license policy.

### Target

The complete pull-request pipeline covers:

1. dependency install from the lockfile without lifecycle scripts where feasible;
2. formatting and lint checks;
3. TypeScript type checking;
4. unit, contract, and integration tests with coverage thresholds focused on critical policy code;
5. browser tests against synthetic fixtures;
6. offline end-to-end test and byte-for-byte repository immutability check;
7. dependency review, secret scanning, static analysis, and license policy;
8. build all packages and validate exports, schemas, and migrations.

Workflows use least-privilege permissions, pinned action SHAs, concurrency cancellation, and no long-lived release credentials. Tests must not call live AI providers.

## Main branch

Protect `main`: require pull requests, successful checks, resolved conversations, and review for sensitive ownership paths. Avoid merge commits if the project chooses a linear history; document the selected convention in `CONTRIBUTING.md`.

## Releases

Use semantic versioning with a changeset per user-visible change. Release candidates build the CLI/server/web bundle on supported Node LTS versions and exercise clean-machine smoke tests on Linux, macOS, and Windows. A release publishes:

- package artifacts with provenance where available;
- checksums and signatures;
- CycloneDX or SPDX SBOM;
- generated changelog and migration notes;
- documented minimum runtime versions.

Release publication should use GitHub OIDC/trusted publishing rather than stored registry tokens. A failed platform build blocks the release; artifacts are never rebuilt manually outside the declared workflow.

## Compatibility policy

Snapshot and sandbox schemas declare supported read/write versions. Minor releases preserve read compatibility; migrations are tested with fixtures from every supported version. Breaking CLI or schema changes require a major version or a documented pre-1.0 migration path.
