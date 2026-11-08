# MVP and delivery phases

## MVP outcome

A developer can run Archwise in a supported Node.js/TypeScript repository, see an evidence-backed system design in a local browser, create a separate sandbox, run deterministic scenarios, and complete an interview session without an account or remote provider.

## MVP scope

### Foundation

- TypeScript monorepo, shared schemas, CLI lifecycle, local API, SQLite migrations, and React shell.
- Workspace resolution from `cwd` and explicit single/multiple paths.
- Versioned snapshot, evidence, diagnostic, sandbox, and scenario contracts.

### Discovery

- Git repositories, package workspaces, TypeScript imports, HTTP routes/clients, common database clients, Docker Compose, and basic environment-variable *names* without values.
- Incremental hashing, partial progress, cancellation, coverage diagnostics, and rescan.

### Visual workspace

- React Flow views for repositories/services/modules and data flow.
- Search, filtering, evidence inspector, confidence/origin legend, graph revision selector, and stable automatic layout.

### Sandbox and simulation

- Add/remove/replace nodes and edges through an operation log.
- Structural comparison and baseline, growth, latency, failure, and queue scenarios.
- Save/export/import with schema validation and no source content.

### Coaching

- Local deterministic question packs and rubric.
- One local/OpenAI-compatible adapter plus one optional remote-provider adapter behind the same interface.
- Reviewable context preview and typed, non-mutating suggestions.

## Explicitly deferred

Language coverage beyond focused adapters, automatic code changes, real-time collaboration, hosted synchronization, enterprise identity, live cloud inventory, trace ingestion, precise cost catalogs, voice, mobile clients, and marketplace plugins.

## Milestones

1. **Contracts and safety:** schemas, fixtures, threat model tests, CLI startup, persistence.
2. **Useful discovery:** supported Node/TypeScript fixtures produce explainable graphs.
3. **Browser inspection:** graph opens automatically and evidence is navigable.
4. **Safe experimentation:** sandbox operations, diffs, stale-base handling, exports.
5. **Reasoning tools:** deterministic simulation and offline interview packs.
6. **Optional AI:** provider boundary, consent UI, injection/leakage evaluation.
7. **Release candidate:** offline end-to-end test, packaging, SBOM, signed artifacts, documentation.

## Release gates

- Clean installation and removal on supported operating systems.
- End-to-end workflow succeeds with network denied.
- Analyzed fixture directories are byte-identical before and after all tests.
- Security tests cover traversal, symlink escape, oversized files, XSS labels, local API origin/token checks, malicious prompt content, and export redaction.
- Performance budgets are measured on small, medium, and large public/synthetic fixtures.
- An OSI-approved license, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md` exist before calling the project open source.
