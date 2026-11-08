# Contributing to Archwise

Archwise is preparing its open-source foundation under [Apache-2.0](LICENSE). The repository contains specifications, governance and initial core packages; an installable application is not available yet. Contributions use the Developer Certificate of Origin (DCO). Report vulnerabilities through the [private security process](SECURITY.md).

## Contribution certification

Read the [Developer Certificate of Origin 1.1](https://developercertificate.org/). Each new contribution commit must include a `Signed-off-by: Name <email>` trailer certifying that you have the right to submit the contribution under the project license. Use your own contributor identity and only certify contributions you are entitled to submit.

Use `git commit -s` to add the trailer. This is a certification of origin, not a cryptographic signature or copyright transfer. No CLA is required. Existing commits predating adoption are not rewritten retroactively. Maintainers verify new commit trailers during review; automated enforcement is not installed yet.

If you forgot the trailer on an unpublished commit, use `git commit --amend --no-edit -s`. Coordinate any changes to already published history with reviewers and collaborators; do not force-push shared branches without agreement.

## Understand the project

Read the [product contract](docs/product-specification.md), [roadmap](docs/implementation-roadmap.md), [architecture](docs/architecture.md), and [agent guide](AGENTS.md). Choose one work package and explain the user outcome before starting implementation.

Keep the core useful offline. Preserve evidence, keep discovered revisions immutable, and put architectural experiments in sandbox overlays. New dependencies need a concrete reason. Prefer small modules with documented public contracts and independently testable behavior.

## Propose a change

Use an issue to describe the problem, acceptance criteria, affected phase, and alternatives. For substantial changes, discuss the design before writing code. An ADR is required for changes to trust boundaries, portable formats, public contracts, package direction, or core invariants. Maintainers record the decision and rationale in the repository.

## Submit a pull request

1. Create a focused branch from the latest main, or identify the parent PR when stacking changes.
2. Implement one coherent outcome and preserve unrelated changes.
3. Add meaningful behavioral tests for code changes and reproduce relevant failure cases.
4. Update user documentation and package responsibilities alongside the implementation.
5. Describe the result, verification evidence, limitations, and compatibility impact in the PR template.
6. Address review comments and wait for required checks and review before merging.

Use Conventional Commit subjects such as `docs: explain snapshot provenance`, `fix: reject paths outside workspace roots`, or `feat: inspect package manifests`. Avoid mixing refactoring and unrelated features in the same PR.

## Verification today

Run `pnpm install --frozen-lockfile --ignore-scripts` and `pnpm check` with Node 26 and pnpm 10.34.9. The current gate checks tooling/package formatting, builds, types and core tests. For documentation changes, also review links, preserve historical documents and run `git diff --check`.

See the [development guide](docs/development/testing.md) for focused tests. Linting and automatic architectural boundary checks remain scheduled foundation work.

## Fixtures and privacy

Use synthetic fixtures or explicitly licensed public examples. Never commit credentials, private source snapshots, machine-specific paths, provider prompts containing sensitive content, or generated caches. Reports should include the smallest sanitized reproduction. Do not post suspected vulnerabilities or exploit details in issues; use the private reporting channel in `SECURITY.md`.

## Review and collaboration

Explain reasoning, request concrete changes, and keep feedback about the work. A new contributor should be able to locate a module's responsibilities, tests, public API, and dependency direction. Reviewers check these qualities alongside correctness and performance. Contributors may challenge decisions with evidence and alternatives.
