# web

Svelte 5 and Svelte Flow Architecture Studio (ADR 0005). It covers Explore mode for the discovered graph and its evidence (the reason catalog `reason-catalog.ts`, claim wording `claims.ts`, indirect relations in `system-view.ts`, counters `counters.ts`, the `Inspector.svelte` with "Show lines" through `excerpt-client.ts`), plus the Sandbox: component catalog, custom nodes, inspector, semantic connections, the deterministic hypothetical simulation, A/B comparison, session autosave and resume through the local session API (`session-client.ts`, `autosave.ts`, `SessionsPanel.svelte`), JSON import/export, and the offline coach. It has no filesystem access and receives the graph only from the authenticated local API.

The simulator, persistence and coach live here temporarily during the Alpha; ADR 0005 records their planned extraction into packages.

**Styling:**

- Colours are design tokens in `src/styles/tokens.css`. There is a dark theme (the default) and a light theme, chosen in `theme.ts`.
- `src/styles/no-literal-colors.test.ts` fails on any literal colour elsewhere.
- JetBrains Mono is bundled from `@fontsource/jetbrains-mono`, so the Studio never fetches a remote font.

**Canvas:**

- `iso/` holds the isometric geometry kit, the pieces and `piece-map.ts`.
- `IsoNode.svelte` draws pieces, and `DiscoveredNode.svelte` draws cards.
- `node-style.ts` chooses between pieces and cards per view.
- `DiscoveredEdge.svelte` draws relations, `focus.ts` computes the focus, and `canvas-keys.ts` with `CanvasKeys.svelte` handles the keyboard.

**The shell:**

- `StudioTopBar.svelte` (top bar);
- `RevisionChip.svelte` (scan time and status, from `scan-status.ts`);
- `ScanNotes.svelte` (files not analyzed and diagnostics, from `scan-notes.ts`);
- `studio-mode.ts` (opening mode and the search shortcut).

Source lives in `src/`. Tests run with `pnpm --filter @archwise/web test`; real-browser acceptance is in `scripts/browser-smoke.mjs`.
