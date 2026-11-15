# ADR 0005: Svelte 5 and Svelte Flow for the browser workspace

- Status: Accepted
- Date: 2026-11-15
- Supersedes in part: ADR 0001 and ADR 0004 (browser UI framework only)

## Context

ADR 0001 and the original roadmap named React and React Flow for the browser workspace, and ADR 0004 introduced a React foundation page. The owner then chose to migrate `apps/web` to Svelte 5 with `@xyflow/svelte` (see the [integration plan](../plans/2026-11-13-svelte-flow-migration-integration.md)). That migration is implemented in the `feat/svelte-flow-migration` branch (draft PR #6). The documentation still described React, so the decision needed to be recorded.

## Decision

Build the browser workspace with Svelte 5 and `@xyflow/svelte`, with ELK.js for automatic layout. Test it with `@testing-library/svelte` and jsdom, check it with `svelte-check`, and run the `Browser Studio Smoke` workflow in real Chromium. Exact versions are pinned in `apps/web/package.json`.

The xyflow project maintains both React Flow and Svelte Flow, and they share the same graph model (nodes, edges, handles and viewport). The product requirements behind the original choice still apply: interactive graph canvas, custom nodes, an inspector and stable layout.

The following are unchanged:

- The local-first boundary.
- Loopback session protection.
- The rule that the browser has no filesystem authority.
- The rule that the web app consumes application APIs and shared schemas.

Domain and schema packages remain framework-free.

## Consequences

- Wherever the roadmap, MVP, architecture and code-organization documents say "React" or "React Flow" for the browser workspace, read it as Svelte and Svelte Flow.
- Lint, formatting and type checks must cover `.svelte` files. `svelte-check` runs during the web build.
- The browser bundle includes ELK and Svelte Flow and is not yet size-optimized. Phase 10 performance budgets must measure it.

## Known architectural debt recorded with this decision

The Alpha slice in PR #6 places logic in apps rather than in the packages defined by the target dependency direction in `AGENTS.md`:

- Manifest inventory, graph construction and the protected loopback HTTP server live in `apps/cli`. `apps/server` remains a metadata shell.
- The deterministic simulator, scenario comparison, Sandbox persistence and offline coach live in `apps/web`.
- The graph and Sandbox formats are app-local types, not `@archwise/domain`/`@archwise/schemas` contracts. The Sandbox is a versioned JSON snapshot rather than the revision-based operation log specified for Phase 7.

This placement is accepted only as a preview. Before the corresponding roadmap phases close, this logic must move behind package contracts: graph contracts (Phase 2), discovery (Phases 3–4), the local server (Phase 5), the Sandbox operation log (Phase 7) and the simulator (Phase 8). Existing behavior must stay covered by tests while it moves.

## Rejected alternatives

- **Revert to React:** this discards working, browser-verified Alpha behavior without a product benefit that justifies the rework.
- **Maintain both frameworks:** this doubles UI testing and dependency surface for a single-maintainer project.
