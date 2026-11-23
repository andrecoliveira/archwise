# Block 9.2 — Canvas-first Studio onboarding and component catalog

This increment makes the Sandbox immediately usable without understanding package discovery first. It is an **Alpha UX improvement**, not production traffic analysis.

## First-use workflow

1. Launch the [Alpha Studio](alpha-testing.md). It opens in **Explore** when your project has components; select the **Sandbox** tab in the top bar. An empty project opens directly in Sandbox.
2. In the left **Components** library, select **Client**, **App Server** and **SQL Database**. Each click adds a proposed component to the canvas. Search also works by name, category or description.
3. Drag nodes to arrange your system. Connect nodes by dragging between their Svelte Flow handles; select the edge to edit the semantic `REQ`, `DB`, etc. intent.
4. Click **Simulation & A/B comparison** below the canvas to reveal hypothetical load and capacity settings. It starts closed to keep the canvas dominant.
5. Use the **Explore** tab to switch to the evidence-based discovered package graph and inspect package manifests. Switching back to Sandbox preserves the design.
6. Export/import the Sandbox as JSON or reload to test local browser restoration.

The catalog groups:
- **Entry & traffic:** Client, Load Balancer.
- **Compute:** App Server, Worker.
- **Data & messaging:** Cache, SQL Database, Message Queue.

Client, Load Balancer, App Server and Worker are **UI presets** represented internally by the existing `service` model primitive. They do not imply client termination, measured load balancing, asynchronous worker semantics, or per-replica capacity yet. Cache, Database and Queue likewise use the existing deterministic capacity model.

## Interaction improvements

- Sandbox is the default; the first-use empty state provides guidance.
- The left sidebar changes role according to the selected mode rather than showing an irrelevant discovery list in Sandbox.
- Proposed Sandbox components are isolated from discovered package nodes in the canvas, preventing invalid cross-mode connections.
- New nodes are positioned in a predictable grid and are not automatically rearranged after every edit. Auto layout remains available.
- The simulation panel is collapsed by default and moved below the canvas.
- Existing local JSON persistence and A/B snapshots remain intact.

## Validation

Unit tests cover catalog presets, grouping and search. `pnpm check` validates Svelte compilation, lint, formatting, typing, dependency boundaries and unit/integration tests.

**Manual browser verification still required:** adding nodes, selecting, dragging, connecting handles, edge intent changes, simulation drawer, responsive layout, JSON restore and browser reload.

## Next increment

Dedicated Svelte Flow custom nodes with visibly labeled input/output handles and a useful inspector for proposed component configuration. The Alpha's baseline simulator must remain clearly hypothetical.
