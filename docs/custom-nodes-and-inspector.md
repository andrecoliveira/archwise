# Block 9.3 — Custom architecture nodes and contextual Inspector

This increment replaces the default proposed Svelte Flow nodes with purpose-built, accessible cards for the Architecture Studio Sandbox.

## Test this in the browser

1. Start the [local Alpha](alpha-testing.md), which opens in **Sandbox · Build**.
2. In the component catalog, add **Client**, **App Server** and **SQL Database**.
3. Each card has an obvious **input handle on the left** and **output handle on the right**. Drag from Client's output handle to App Server's input, then App Server's output to SQL Database's input.
4. Select a node. The contextual inspector appears inside the canvas on the right. Rename it, change its **capacity** (RPS) or **baseline latency** (ms), and toggle **Simulate failure**. Cache nodes also expose **cache hit rate**.
5. Watch the node's modeled utilization or bottleneck state update using the same simulation settings that the lower drawer uses.
6. Select a connection to edit its semantic intent. The intent is still *visual metadata*; the capacity simulator doesn't interpret production network traffic from labels.
7. Export the Sandbox JSON, refresh/restart the Studio, and import it. Custom component preset identity, names, topology, intent types and numerical settings should be retained.
8. Switch to **Explore · Inspect** to inspect discovered package evidence. The workspace source files are not changed by any Sandbox operations.

## Design boundaries

- Custom nodes are **only for proposed Sandbox components**. Discovered package nodes remain read-only evidence-backed graph elements.
- A Client, Load Balancer or Worker is currently a *catalog preset* backed by the deterministic service-capacity primitive. There is no claim of real client behavior, load balancing, queue consumption or replica-aware throughput.
- The inspector edits the existing model's capacity, latency, cache hit rate and failure controls; the Simulation & A/B comparison drawer remains available.
- The node's modeled status is educational only. This release does not compute real p95/p99, availability, error budget or network telemetry.
- JSON v1 retains backward compatibility: `nodes[].preset` is optional. Existing saved documents without it still load and become custom nodes, with a generic icon derived from their `kind`.
- Imported preset IDs must belong to the known catalog and match the simulated `kind`.

## Quality gates

The full `pnpm check` passed on Linux, macOS and Windows with Node.js 24 and 26, including 70 Vitest tests and 12 Node-native tests. New tests verify that preset identity survives JSON export/import and malformed preset mappings are rejected.

The automated [browser smoke test](browser-qa.md) covers node creation, inspector editing, click-to-connect and persistence in Chromium. Drag-to-connect reliability, touch input and responsive layout are still open known limitations.
