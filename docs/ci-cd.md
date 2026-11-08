# CI/CD and releases

## Pull-request checks

The initial GitHub Actions pipeline should run on Linux, with platform smoke tests added as packaging begins:

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
