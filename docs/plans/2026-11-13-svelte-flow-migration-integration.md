# Svelte 5 + Svelte Flow migration — integration plan

Status: **draft; implementation package prepared locally, not yet merged**.

## Scope
- Replace the React-based `apps/web` UI with Svelte 5 and `@xyflow/svelte`.
- Preserve the Node.js local CLI/API, evidence-backed discovered graph, and framework-neutral deterministic simulation engine.
- Keep Explore read-only with respect to discovered architecture; Sandbox operations must never mutate the discovered source graph or analyzed repositories.
- Maintain inspector, searching, ELK.js layout, proposed nodes/edges, simulation controls, and local-only operation.

## Proposed dependencies
- `svelte` 5
- `@xyflow/svelte` 1.7
- `elkjs` 0.12
- `@sveltejs/vite-plugin-svelte` 7
- `@testing-library/svelte` 5

## Integration sequence
1. Integrate CLI inventory, graph and loopback server from preceding local development slices, which have **not yet been committed to this repository**.
2. Apply the cumulative Svelte frontend patch to `apps/web`, deleting superseded TSX source and React dependencies.
3. Migrate tests and update root formatting/lint tooling for `.svelte` files.
4. Run `pnpm install --no-frozen-lockfile` to update the lockfile in the feature branch.
5. Run web typecheck, unit tests, build and root `pnpm check`.
6. Run real browser smoke tests: CLI scan → protected HTTP server → discovered graph → Explore → Sandbox → simulation.
7. Request review only after all checks pass.

## Acceptance criteria
- Browser presents the actual discovered architecture rather than a blank canvas when a project can be inspected.
- Every discovered node/edge retains its source evidence.
- Explorer never rewrites project sources.
- All proposed elements have distinct styling and isolation.
- Simulated numbers are labeled model-derived estimates with visible assumptions, not production measurements.
- Loopback session protection and origin checks are preserved.
- No cloud login or AI provider required.

## Validation caveat
A cumulative implementation ZIP was prepared in the development conversation, but the dependent packages were unavailable for full installation and E2E verification. This GitHub branch initially contains **only this integration plan**, not the implementation ZIP. Do not merge until the code is published and checked.
