# Contributing to Archwise

Archwise is preparing its open-source foundation. The repository currently contains specifications and governance documents, not an installable application. License, contributor-signoff policy, and the private security channel require the owner's decision before public launch. This document grants no additional license rights.

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

There is no package manifest or application test suite yet. For documentation changes, review internal links, preserve historical documents, and run `git diff --check`. Verify that examples describe actual behavior or are explicitly labeled proposals.

The foundation phase will introduce a pinned toolchain and `pnpm check`. That command is planned and cannot currently be run. Its prerequisites and clean-clone instructions must be documented when the tooling is delivered.

## Fixtures and privacy

Use synthetic fixtures or explicitly licensed public examples. Never commit credentials, private source snapshots, machine-specific paths, provider prompts containing sensitive content, or generated caches. Reports should include the smallest sanitized reproduction. Do not post suspected vulnerabilities or exploit details in issues; the private reporting channel must be established before public launch.

## Review and collaboration

Explain reasoning, request concrete changes, and keep feedback about the work. A new contributor should be able to locate a module's responsibilities, tests, public API, and dependency direction. Reviewers check these qualities alongside correctness and performance. Contributors may challenge decisions with evidence and alternatives.
