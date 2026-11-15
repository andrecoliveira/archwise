# Code organization

The tree below is the **target** layout. Today, `main` contains the following:
- **Packages:** `apps/{cli,server,web}` and `packages/{domain,schemas,application,test-fixtures}`.
- **Graph contracts:** `archwise.graph` v1 lives in `domain` and `schemas`.
- **Alpha logic placed in apps:** manifest discovery and the loopback server are in `apps/cli`; the simulator, Sandbox persistence and coach are in `apps/web`.

[ADR 0005](decisions/0005-svelte-flow-browser-workspace.md) records the Alpha logic in apps as debt, to be moved into the target packages as the matching roadmap phases land.

```text
archwise/
├── apps/
│   ├── cli/                    # command parsing, lifecycle, browser launch
│   ├── server/                 # loopback API and streaming transport
│   └── web/                    # Svelte + Svelte Flow browser workspace
├── packages/
│   ├── domain/                 # graph, evidence, sandbox, scenario contracts
│   ├── application/            # use cases and policy enforcement
│   ├── discovery-core/         # analyzer API, pipeline, inventory, resolution
│   ├── discovery-typescript/   # Node/TS framework and syntax analyzers
│   ├── discovery-infra/        # Compose/Kubernetes/Terraform adapters
│   ├── graph/                  # revisions, projections, diffs, layouts
│   ├── simulator/              # deterministic models and scenario library
│   ├── ai-core/                # provider-neutral coaching contracts
│   ├── ai-providers/           # optional provider adapters
│   ├── storage/                # SQLite and blob-store adapters
│   ├── schemas/                # runtime schemas and migrations
│   └── test-fixtures/          # synthetic repositories and golden snapshots
├── docs/
├── .github/workflows/
├── AGENTS.md
└── README.md
```

## Boundary rules

- `domain` is pure TypeScript and has no runtime framework, filesystem, database, UI, or provider dependencies.
- `application` depends on domain contracts and ports, not concrete adapters.
- Discovery packages emit normalized evidence; they do not construct UI nodes.
- Graph projections and layouts are derived and replaceable; canonical data does not contain canvas coordinates except saved user layout preferences.
- `simulator` consumes domain graphs and scenarios without importing AI code.
- `ai-core` consumes curated context DTOs, never filesystem handles or database connections.
- Apps compose dependencies and own transport/framework concerns.

## Testing layers

- Unit tests beside focused domain and analyzer modules.
- Contract tests for analyzers, storage adapters, provider adapters, and migrations.
- Golden snapshot tests over synthetic fixtures with paths normalized.
- Integration tests for scan-to-revision and sandbox-to-simulation flows.
- Browser tests for graph loading, evidence inspection, sandbox origin styling, and consent.
- Packaged end-to-end tests with network denied and analyzed directories verified unchanged.

## Configuration

Configuration precedence is CLI flags, user workspace settings, user global settings, then defaults. Repository files do not silently control security-sensitive behavior. Unknown keys and invalid values fail with actionable messages; effective configuration is inspectable with secrets redacted.
