# web

Svelte 5 and Svelte Flow Architecture Studio (ADR 0005). It covers Explore mode for the discovered package graph and its evidence, plus the Sandbox: component catalog, custom nodes, inspector, semantic connections, the deterministic hypothetical simulation, A/B comparison, local persistence with JSON import/export, and the offline coach. It has no filesystem access and receives the graph only from the authenticated local API.

The simulator, persistence and coach live here temporarily during the Alpha; ADR 0005 records their planned extraction into packages.

Source lives in `src/`. Tests run with `pnpm --filter @archwise/web test`; real-browser acceptance is in `scripts/browser-smoke.mjs`.
