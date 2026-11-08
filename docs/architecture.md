# Architecture

## Runtime shape

Archwise is a local Node.js/TypeScript application with a browser UI. A single CLI command starts an application service bound to loopback and opens a capability-scoped browser URL.

```text
Developer repositories (read-only)
          │
          ▼
Discovery adapters ──> normalized evidence ──> graph builder
                                                  │
                                                  ▼
                                      local snapshot store
                                                  │
                         ┌────────────────────────┼─────────────────────┐
                         ▼                        ▼                     ▼
                  local HTTP API            simulator           optional AI
                         │                                          adapters
                         ▼
                React + React Flow UI
```

## Components

### CLI and workspace resolver

The CLI owns path resolution, startup options, lifecycle, browser launch, and human-readable diagnostics. Default invocation analyzes `cwd`; repeated `--repo` arguments or a workspace manifest add repositories. The CLI never changes process-wide working directory after paths are resolved.

### Discovery engine

Discovery is a pipeline of independently testable analyzers. It inventories files and manifests, identifies repository/package boundaries, extracts evidence, emits normalized facts, and resolves facts into graph nodes and edges. Analyzers declare supported file patterns, cost, version, and capabilities.

### Domain and application services

The domain defines versioned graph, evidence, scenario, diagnostic, and coaching types. Application services coordinate scans, revisions, sandboxes, simulations, imports/exports, and provider calls. They enforce invariants independent of UI or transport.

### Local persistence

SQLite is the proposed local index for workspaces, scan metadata, graph revisions, scenarios, and sessions. Content-addressed blobs may hold larger derived artifacts. Storage lives under an OS-appropriate application data directory, not inside analyzed repositories. Schema migrations are transactional and backup before destructive changes.

### Local API

The server exposes versioned JSON endpoints and Server-Sent Events initially for scan progress and graph patches. It binds to `127.0.0.1` by default, validates `Origin`, requires a random per-session capability token, limits request size, and accepts only registered workspace identifiers rather than arbitrary paths.

### Browser workspace

React renders the application shell; React Flow renders interactive graphs. Large-graph strategies include hierarchical aggregation, server-side filtering, progressive expansion, stable layout caching, and viewport virtualization. The UI never receives unrestricted filesystem access.

## Core data flow

1. Resolve and validate workspace roots.
2. Inventory allowed files while respecting ignore and safety rules.
3. Run analyzers and store normalized evidence with diagnostics.
4. Build a new immutable graph revision.
5. Stream progress and patches to the UI.
6. Render the newest complete or partial revision with provenance.
7. Base sandboxes on an explicit revision and detect stale bases after rescans.

## Failure behavior

Analyzer failures are isolated and become diagnostics; they do not invalidate facts produced by other analyzers. Cancellation leaves the last complete graph revision available. Corrupt local state is quarantined and reported, not silently overwritten. Unsupported files appear as coverage gaps. Remote-provider failures never prevent local inspection or deterministic simulation.

## Versioned contracts

Snapshots, sandbox operations, simulator inputs, and provider request envelopes each carry a schema version. Readers accept supported older versions through explicit migrations and reject unknown future versions with a recovery message. Package interfaces use shared runtime validation rather than TypeScript types alone.
