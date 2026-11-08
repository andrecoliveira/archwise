# End-to-end implementation roadmap

## Purpose

This roadmap turns the Archwise specification into an ordered delivery program from an empty documentation repository to a stable public `1.0.0` release. It is the sequencing source of truth, not a substitute for phase-level implementation plans. Every phase receives a focused plan with exact files, tests, migrations, and review steps immediately before execution.

## Definition of finalization

Archwise reaches the end of this roadmap when version `1.0.0` is publicly released and all of the following are true:

- a developer can install and run Archwise on supported Linux, macOS, and Windows environments;
- running from `cwd` or an explicit multi-repository workspace produces an evidence-backed graph;
- the graph opens automatically in a local React Flow browser workspace;
- discovery never executes analyzed project code and does not modify analyzed repositories;
- real graph revisions, sandbox operations, comparisons, simulations, and exports work offline;
- deterministic interview packs work offline and optional AI providers require explicit configuration and consent;
- security, compatibility, accessibility, performance, packaging, contribution, and release gates pass;
- public APIs and portable formats have a documented compatibility policy;
- contributors can understand, test, extend, and release the project from repository documentation;
- the repository carries an OSI-approved license and community/security policies.

Finalization does not mean development stops. It establishes a reliable open-source core and a versioned foundation for post-1.0 analyzers, integrations, collaboration, and optional commercial services.

## Program rules

1. Deliver a working vertical slice at the end of each phase; do not build disconnected layers for several phases.
2. Use test-driven development for domain rules, security boundaries, parsers, migrations, and compatibility behavior.
3. Keep `main` releasable. Work through small branches and reviewed pull requests.
4. Record changes to invariants, formats, trust boundaries, or package direction in ADRs.
5. Prefer stable contracts and adapters over shared mutable utilities.
6. A phase cannot close with known critical security defects, undocumented migrations, failing tests, or placeholder behavior.
7. Preserve the offline path. New networked capabilities must degrade cleanly when unavailable.
8. Measure before optimizing; keep performance fixtures and budgets reproducible.

## Delivery map

| Phase | Outcome | Depends on | Release marker |
|---|---|---|---|
| 0 | Governance and decisions | Specification | repository ready |
| 1 | Monorepo and quality foundation | 0 | `0.1.0-dev` |
| 2 | Domain contracts and local storage | 1 | internal contracts v1 |
| 3 | Safe workspace inventory | 2 | CLI inventory preview |
| 4 | Node/TypeScript and infrastructure discovery | 3 | useful graph fixture |
| 5 | Local API and browser inspection | 4 | first end-to-end alpha |
| 6 | Incremental rescans and multi-repo resolution | 5 | `0.2.0-alpha` |
| 7 | Sandbox, comparison, and portability | 6 | `0.3.0-alpha` |
| 8 | Deterministic simulator | 7 | `0.4.0-alpha` |
| 9 | Offline interviewer and optional AI | 8 | `0.5.0-beta` |
| 10 | Hardening, accessibility, and performance | 9 | release candidate |
| 11 | Packaging, community launch, and `1.0.0` | 10 | `1.0.0` |

---

## Phase 0 — Governance and irreversible decisions

Status: in progress. Contribution guidelines, issue forms, a PR template, and initial code ownership are prepared. License, DCO/CLA policy, and private security reporting await owner decisions; the phase exit gate is not yet satisfied.

### Goal

Make legal, contribution, compatibility, and architectural expectations explicit before code attracts dependencies and contributors.

### Work packages

- Select an OSI-approved license after evaluating contribution and open-core goals. Apache-2.0 is the recommended default because it provides an explicit patent grant; the owner makes the final legal decision.
- Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, pull-request template, and code-ownership rules.
- Decide Node LTS support, package manager, monorepo tool, module format, minimum browser targets, and versioning policy in ADRs.
- Define maintainer roles, review expectations, decision process, DCO or contributor agreement policy, and security response channel.
- Convert the proposed local-first ADR to accepted after reviewing the selected license and boundaries.
- Create a public roadmap label/milestone structure without presenting dates as commitments.

### Exit gate

- License and policies are visible from the README.
- A clean contributor can understand how to propose, test, review, and report a vulnerability.
- Architecture and tooling decisions are accepted ADRs with consequences and alternatives.
- Branch protection requirements are documented and enabled where the GitHub plan permits.

---

## Phase 1 — Monorepo and quality foundation

### Goal

Create the smallest buildable TypeScript workspace with enforceable package boundaries and a CI pipeline that future contributors can trust.

### Work packages

- Bootstrap pnpm workspaces with Turborepo, Node LTS, strict TypeScript, ESM, ESLint, Prettier, Vitest, Changesets, and dependency-boundary checks.
- Create empty but compilable `domain`, `schemas`, `application`, `cli`, `server`, and `web` packages/apps.
- Add a shared test fixture package and deterministic temporary-workspace helpers.
- Establish commands: `format`, `lint`, `typecheck`, `test`, `test:integration`, `build`, `check`, and `dev`.
- Add CI for lockfile install, formatting, linting, type checking, unit tests, build, dependency review, secret scan, and CodeQL.
- Add architectural tests that prevent domain imports from framework, filesystem, database, UI, or provider packages.

### Exit gate

- A clean clone can install and run `pnpm check` from documented prerequisites.
- Every package builds independently and exposes only declared entry points.
- CI uses least privileges and pinned actions.
- No production feature is claimed; the first release is development-only.

Detailed execution plan: [`superpowers/plans/2026-11-08-archwise-foundation.md`](superpowers/plans/2026-11-08-archwise-foundation.md).

---

## Phase 2 — Domain contracts and local persistence

### Goal

Implement the stable vocabulary and revision model used by every later capability.

### Work packages

- Define runtime-validated IDs, workspace roots, evidence, diagnostics, normalized facts, graph nodes/edges, graph revisions, views, analyzer capabilities, and scan lifecycle events.
- Model confidence as explainable categories plus supporting reasons.
- Define version envelopes for snapshots, sandbox operations, scenarios, coaching sessions, and exports.
- Implement immutable graph-revision construction and validation.
- Define application ports for clock, ID generation, filesystem inventory, storage, event publication, browser launch, and provider access.
- Implement SQLite workspace, scan, revision, and diagnostic repositories with transactional migrations and backup behavior.
- Add JSON export/import for a minimal graph revision with path normalization and schema checks.

### Required tests

- Unit tests for every invariant and invalid transition.
- Property tests for graph identity, deterministic serialization, and immutable revisions.
- Contract tests for in-memory and SQLite repositories.
- Migration tests from every supported schema fixture.
- Redaction tests proving secrets and absolute home paths cannot enter exports.

### Exit gate

- Domain and schemas remain independent of Node APIs and frameworks.
- The same fixture serializes identically across supported platforms.
- Corrupt or future-version data fails safely with actionable diagnostics.
- Storage recovery behavior is documented and tested.

---

## Phase 3 — Safe workspace inventory

### Goal

Resolve `cwd` and explicit roots, inventory repositories safely, and show explainable scan progress without interpreting application semantics yet.

### Work packages

- Implement CLI argument parsing for `cwd`, `--path`, repeated `--repo`, `--workspace`, `--no-open`, and diagnostic output.
- Canonicalize, deduplicate, and validate roots without changing process-wide `cwd`.
- Detect VCS and common workspace boundaries; represent nested repositories explicitly.
- Implement ignore rules, binary detection, file/depth/byte/time budgets, cancellation, hashing, and symlink-escape prevention.
- Persist scan metadata and emit structured progress/coverage diagnostics.
- Add a human-readable inventory preview and machine-readable JSON mode.

### Required tests

- Fixture tests for unreadable roots, nested repositories, cyclic symlinks, path traversal, huge files, Unicode paths, Windows paths, cancellation, and ignore precedence.
- End-to-end test proving fixture repositories are byte-identical after scanning.
- Performance benchmark over small, medium, and large synthetic trees.

### Exit gate

- Default scan performs no project execution, network access, or writes inside roots.
- Every skipped path has a reason category.
- Inventory results are deterministic for unchanged files and analyzer versions.
- CLI errors are actionable and stable enough for documentation.

---

## Phase 4 — Useful architecture discovery

### Goal

Turn supported Node.js/TypeScript and infrastructure files into an evidence-backed architecture graph.

### Work packages

- Define the analyzer SDK: capability declaration, inputs, evidence emission, budgets, cancellation, version, and diagnostics.
- Parse package manifests and pnpm/npm/yarn/Turborepo/Nx workspace relationships without evaluating scripts.
- Parse TypeScript/JavaScript imports/exports and selected framework conventions through safe syntax parsers.
- Add initial HTTP endpoint/client, database-client, queue/topic, scheduled-job, and environment-variable-name detectors.
- Parse Docker Compose and selected deployment manifests as data, never templates or commands.
- Resolve normalized facts into repositories, services, modules, APIs, stores, queues, jobs, deployment units, and typed edges.
- Preserve ambiguous and unresolved candidates rather than forcing a relationship.

### Required tests

- One synthetic fixture per analyzer behavior and threat case.
- Golden graph snapshots with normalized paths and stable ordering.
- Analyzer contract tests for timeouts, invalid syntax, partial results, and version changes.
- Precision review against representative open-source fixtures checked into or generated by the test package under compatible licenses.

### Exit gate

- A documented supported fixture produces a useful graph with source evidence for every visible item.
- Unsupported patterns appear as coverage gaps, not guessed facts.
- One analyzer failure does not discard other valid evidence.
- Analyzer interfaces can be implemented outside the core package without importing app internals.

---

## Phase 5 — Local API and browser inspection

### Goal

Open the discovered architecture automatically in a safe, accessible local browser workspace.

### Work packages

- Implement loopback server startup, random port selection, capability-scoped session URL, origin/host validation, request limits, CSP, and graceful shutdown.
- Expose versioned workspace, scan, revision, graph, evidence, diagnostic, and progress endpoints.
- Stream progress and graph patches using Server-Sent Events with reconnect semantics.
- Build the React application shell, router, error boundaries, keyboard navigation, theme tokens, and local-only status indicators.
- Render React Flow system/repository/service/module and data-flow views with stable automatic layout.
- Add search, filters, breadcrumbs, confidence/origin legend, revision selector, evidence inspector, diagnostics panel, and coverage summary.
- Add aggregation, progressive expansion, viewport rendering, and layout caching for large graphs.

### Required tests

- API contract tests and browser tests for startup, reconnect, expired capability, malicious labels, XSS payloads, and error recovery.
- Accessibility tests for keyboard-only navigation, focus order, labels, contrast, and reduced motion.
- Visual regression tests for origin/confidence states and partial scans.
- End-to-end test: CLI scans fixture, opens a scoped URL, graph appears, evidence navigates to a normalized source reference.

### Exit gate

- Browser has no arbitrary filesystem capability.
- A useful partial graph appears while discovery continues.
- The server is unreachable without the session capability and rejects untrusted origins.
- Large-fixture interaction stays within the documented performance budget.

---

## Phase 6 — Incremental rescans and multi-repository resolution

### Goal

Keep graphs current and resolve relationships across repositories without losing provenance.

### Work packages

- Add file watching with debounce, overflow recovery, pause/resume, and clean rescan.
- Cache analyzer output by content hash, analyzer version, and relevant configuration.
- Build atomic child revisions and publish patches only after invariant validation.
- Resolve declared package coordinates, service names, images, schemas, topics, Terraform outputs, and workspace hints across roots.
- Add user confirmations/rejections as separate attestations.
- Detect Git branch changes and stale evidence.
- Add a reviewed, exportable `archwise.workspace.json` format without creating it automatically.

### Exit gate

- A one-file change reruns only affected analyzers and produces a traceable child revision.
- Watch overflow and branch switches recover through a consistency scan.
- Multi-repo relations expose why they are confirmed, inferred, ambiguous, or unresolved.
- Cache invalidation tests cover analyzer and schema upgrades.

---

## Phase 7 — Sandbox, comparison, and portability

### Goal

Allow safe architectural experimentation while making proposed changes impossible to confuse with discovered reality.

### Work packages

- Implement validated operation-log commands for nodes, edges, attributes, grouping, and annotations.
- Materialize derived graphs without mutating their base revision.
- Add undo/redo, named checkpoints, autosave, discard, and duplicate sandbox.
- Render discovered, inferred, confirmed, proposed, changed, and removed states distinctly and accessibly.
- Implement structural comparison, boundary/cycle/single-point-of-failure metrics, and narrative change summaries from deterministic rules.
- Detect stale bases and implement explicit rebase mapping/conflict resolution.
- Export/import snapshots and sandboxes with checksums, size limits, schema migrations, and source-free portability.

### Exit gate

- Hashes prove a base revision cannot change through sandbox operations.
- Screenshots and exports always retain sandbox status and base revision.
- Every conflict requires an explicit resolution.
- Round-trip export/import is deterministic and contains no secret values or absolute machine paths.

---

## Phase 8 — Deterministic simulator

### Goal

Provide transparent, reproducible reasoning about traffic, latency, saturation, resilience, queues, and relative cost.

### Work packages

- Define validated scenario inputs, distributions, units, seeds, topology, failure assumptions, and result envelopes.
- Implement critical-path latency, utilization/saturation, bottleneck throughput, topology availability, retry amplification, queue backlog, recovery, and user-supplied relative-cost models.
- Include model version, formulas, assumptions, missing inputs, uncertainty, warnings, and sensitivity drivers in every result.
- Add baseline, 10× growth, dependency latency, service failure, datastore degradation, regional outage, and retry-storm templates.
- Build scenario editor, results dashboard, graph overlays, comparison, and export.

### Exit gate

- Same inputs, version, and seed produce identical results.
- Property tests enforce monotonic and conservation expectations.
- The UI distinguishes unknown, assumed, estimated, and measured values.
- Documentation states limitations and never represents estimates as production guarantees.

---

## Phase 9 — Offline interviewer and optional AI

### Goal

Help users practice and review system design without making AI or network access part of the core dependency chain.

### Work packages

- Implement deterministic question packs, hint progression, rubric, session state, scoring evidence, and review summary.
- Add interviewer, coach, and reviewer flows that ask one focused question at a time.
- Define provider-neutral chat, structured-output, streaming, token-estimation, cancellation, and error contracts.
- Implement one local OpenAI-compatible adapter and one optional remote adapter in separate packages.
- Store credentials in OS facilities or process environment; never browser storage or snapshots.
- Build context selection and preview, data-category disclosure, redaction, explicit code-excerpt consent, budgets, and provider disable controls.
- Treat repository/model text as untrusted; validate typed proposals and prevent tools from filesystem, command, graph-write, or arbitrary-network access.
- Add synthetic evaluation fixtures for relevance, citation, hint progression, proposal validity, injection resistance, and leakage prevention.

### Exit gate

- Full interview workflow succeeds with networking denied.
- Provider failures preserve the session and fall back to offline tools.
- Remote transmission cannot occur before provider configuration and per-boundary consent.
- AI output never mutates canonical or sandbox graphs without explicit user acceptance.

---

## Phase 10 — Product hardening

### Goal

Turn the complete feature set into a dependable release candidate across platforms and realistic project sizes.

### Work packages

- Perform threat-model review and targeted security testing of parsers, local API, imports, exports, prompts, credentials, and update path.
- Add fuzzing for parsers, schemas, operation logs, imports, and API payloads.
- Profile startup, scanning, storage, layout, rendering, watching, and memory; publish budgets and regression thresholds.
- Test crash recovery, disk-full, locked database, interrupted migration, port collision, stale process, and corrupt cache behavior.
- Complete WCAG 2.2 AA review and supported browser/assistive-technology matrix.
- Validate Windows path/process behavior, macOS permissions, Linux desktop/browser launch, proxies, and offline installation.
- Run external contributor onboarding rehearsal from a clean machine and improve documentation based on observed friction.
- Freeze public schemas/APIs for the release candidate and document deprecations.

### Exit gate

- No open critical/high security findings; accepted lower risks have owners and rationale.
- Performance and reliability suites pass on release fixtures.
- Accessibility review has no blocking defects.
- Upgrade, downgrade limits, backup, recovery, uninstall, and data-location behavior are documented.

---

## Phase 11 — Packaging, community launch, and 1.0

### Goal

Publish a verifiable, maintainable open-source release and establish the operating rhythm after launch.

### Work packages

- Produce platform-appropriate CLI/application packages from reproducible CI builds.
- Publish checksums, signatures, SBOMs, artifact provenance, changelog, migration notes, and supported-runtime matrix.
- Use trusted publishing/OIDC; no long-lived release secrets.
- Run clean-machine install/start/scan/sandbox/simulate/interview/export/uninstall smoke tests on all supported platforms.
- Publish user guide, analyzer authoring guide, architecture guide, troubleshooting, privacy model, security reporting, and contributor quick start.
- Create tagged `1.0.0`, GitHub Release, package-registry artifacts, announcement, and clearly labeled post-1.0 roadmap.
- Establish triage, release cadence, support windows, deprecation policy, maintainer rotation, and community communication channels.

### Final gate

- All finalization criteria at the top of this document have fresh verification evidence.
- Release artifacts resolve to the tagged source and pass checksum/signature validation.
- The offline workflow and provider-consent workflow are independently demonstrated.
- `main`, the tag, published packages, documentation, and changelog agree on version and behavior.
- A rollback or advisory process exists before publishing the release announcement.

---

## Cross-cutting workstreams

These run in every phase rather than being deferred to hardening:

### Security and privacy

Update the threat model with every new trust boundary. Add a regression test with every security fix. Keep source transmission, telemetry, and analyzed-repository writes deny-by-default.

### Documentation and developer experience

Every user-visible command, contract, error class, and configuration option ships with documentation. Each new package has a concise README explaining responsibility, public API, dependencies, and tests.

### Compatibility

Portable formats and public contracts use explicit versions. Maintain old-version fixtures and migrations. Deprecations require warnings, replacements, and removal timing.

### Observability without surveillance

Use structured local diagnostics with redaction and user-controlled export. Local telemetry remains off by default. Hosted metrics, if introduced after core completion, are separate and opt-in.

### Community health

Label approachable issues, document expected scope, acknowledge contributors, and keep review feedback instructional. Automate consistency checks while keeping project conventions understandable without specialized tooling.

## Phase planning template

Before implementation begins on each phase, create `docs/superpowers/plans/YYYY-MM-DD-<phase>.md` containing:

1. exact files created or modified and their single responsibilities;
2. public types and interfaces with complete definitions;
3. test-first steps with expected failing and passing commands;
4. fixtures and threat cases;
5. migrations and compatibility behavior;
6. documentation changes;
7. small commit boundaries;
8. a requirement-to-task coverage checklist;
9. rollback and recovery behavior where state can change;
10. final verification commands and expected evidence.

Do not begin a phase merely because the prior phase has code merged. Begin only after its exit gate is verified and the next plan is reviewed against the current repository state.

## Progress reporting

Maintain a GitHub milestone per phase and issues per work package. The roadmap records outcome and ordering; issues record current status. A phase is marked complete only when its exit gate links to CI runs, tests, benchmarks, security evidence, documentation, and the release or commit that delivered it.
