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
              Svelte + Svelte Flow UI
```

## Components

### CLI and workspace resolver

The CLI owns path resolution, startup options, lifecycle, browser launch, and human-readable diagnostics. Default invocation analyzes `cwd`; repeated `--repo` arguments or a workspace manifest add repositories. The CLI never changes process-wide working directory after paths are resolved.

### Discovery engine

Discovery is a pipeline of independently testable analyzers.
- `@archwise/discovery` inventories files and manifests and reads only the files analyzers declare, never deny-listed ones.
- `@archwise/analyzers` holds the built-in analyzers. They are pure functions over that text, with no Node built-ins, that emit normalized facts with evidence.
- `@archwise/application` defines the analyzer contract and runs analyzers in isolation, with per-analyzer time and file budgets. Its `resolveArchitecture` merges inventory and facts into the view graph: packages, services, frontends, datastores, queues and external systems, with typed edges.

Analyzers declare their file names, extensions, version and budget. See [Discovery](discovery.md#architecture-analyzers).

### Domain and application services

The domain defines versioned graph, evidence, scenario, diagnostic, and coaching types. Application services coordinate scans, revisions, sandboxes, simulations, imports/exports, and provider calls. They enforce invariants independent of UI or transport.

### Local persistence

SQLite is the local index ([ADR 0006](decisions/0006-local-store-node-sqlite.md)). `@archwise/storage` implements the application store ports on `node:sqlite`. It is implemented today for workspaces, graph revisions and Sandbox sessions; scan metadata and scenarios are future tables. Content-addressed blobs may later hold larger derived artifacts.

Storage lives in an OS-appropriate application data directory, not inside analyzed repositories. On open the store does the following:
- runs an integrity check and quarantines a corrupt file;
- refuses a store written by a newer Archwise;
- backs up the file before migrating;
- applies migrations in one transaction.

See [Sessions and the local store](sessions.md).

### Local API

The server exposes versioned JSON endpoints and Server-Sent Events initially for scan progress and graph patches. It binds to `127.0.0.1` by default, validates `Origin`, requires a random per-session capability token, limits request size, and accepts only registered workspace identifiers rather than arbitrary paths.

Today it serves the view graph (`/api/v1/graph`), the scan summary (`/api/v1/scan`), health, the session routes and evidence excerpts (`/api/v1/evidence/excerpt/<id>`). The served graph's evidence items carry an `excerptId`: an opaque key for an evidence item of the latest scan, held only in server memory. An excerpt is at most 40 lines, masked and never cached. The graph stored in sessions never carries these ids. See [ADR 0008](decisions/0008-excerpts-and-stored-config-values.md) and [Security](security.md#evidence-excerpts).

### Browser workspace

Svelte 5 renders the application shell; Svelte Flow renders interactive graphs (see ADR 0005). The UI never receives unrestricted filesystem access.

**The Studio layout:**
- A top bar holds the workspace name, the revision chip, the **Explore** and **Sandbox** tabs, component search, the save status, Sessions and the theme toggle.
- Three columns sit below it:
  - **left:** the component list and Scan notes in Explore, the catalog in Sandbox;
  - **center:** the canvas;
  - **right:** the inspector.

  The side columns collapse, and below 1100 px of viewport width they become drawers.

**Opening mode.** When the page loads, the Studio opens in Explore if the scan found components, and in Sandbox otherwise. Refreshing the graph, resuming a session, or starting or deleting one keeps the mode the person chose. A browser reload opens Explore again.

**Design tokens.**
- Every colour is a token in `apps/web/src/styles/tokens.css`, with a dark theme (the default) and a light theme. A test fails on any literal colour elsewhere.
- The tokens follow one rule: the fill colour says what a component is, the line style says how sure Archwise is, and the accent marks only selection and focus.

**Pieces and cards.**
- Components are drawn as isometric **pieces** (`apps/web/src/iso/`) or as flat **cards**. A pure geometry kit (`iso/kit.ts`) projects true 30° isometric shapes, and one Svelte component draws each kind.
- Pieces are the default in the System view; cards are the default in All packages, in Sandbox and in any view with more than 80 components. A person's choice is remembered per view.
- Selecting a component lights its plinth and dims what it does not connect to. Focused relations show a dot that stops before the arrowhead.
- Animations are decorative. They never encode data, and they never run when the operating system asks for reduced motion.
- The canvas region is focusable:
  - arrow keys pan;
  - `+` and `-` zoom;
  - `0` fits;
  - Enter or Space selects the focused component;
  - Esc clears the selection.
- The Studio's selection is the only source of what the canvas marks as selected, whether it comes from a click, the list or the keyboard. Zoom stays between 25% and 300%.

The design decisions are in the [Studio redesign spec](superpowers/specs/2026-11-23-studio-redesign-design.md). The words the UI uses are in [`CONTEXT.md`](../CONTEXT.md).

Large-graph strategies remain future work: hierarchical aggregation, server-side filtering, progressive expansion, stable layout caching and viewport virtualization.

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
