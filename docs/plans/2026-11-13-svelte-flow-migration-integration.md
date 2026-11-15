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

## Progress update — 2026-11-15

The feature branch now includes a read-only Node manifest inventory, evidence-backed declared-package graph, CLI `--graph`, a protected loopback HTTP graph endpoint (`--serve`), and an initial Svelte 5/Svelte Flow inspector with an isolated in-memory Sandbox. The pnpm lockfile was refreshed by CI. The browser bundle and full cross-platform pipeline are **not yet verified**; this remains a draft PR. The long-term repository analyzers, persisted graph revisions, simulation UI and coaching are not yet integrated into this branch. Static project inspection is deliberately limited to package manifests and declared internal dependencies.

Next gates: green format, build, lint, typecheck and test; browser integration and session/origin regression tests; then simulator and deterministic coach as independent increments. Do not merge the draft until these are green.
