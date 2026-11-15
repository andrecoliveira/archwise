# Simulation Engine — deterministic Sandbox model

This increment provides a **local-only teaching simulation**, not a production observability or benchmarking tool.

## How to try it

1. Build and launch the Architecture Studio by following [Alpha testing](alpha-testing.md).
2. Switch to **Sandbox**.
3. Add hypothetical nodes (Service, Cache, Database or Queue). Give each one a name.
4. Drag connections **between proposed nodes**, from the upstream output handle to the downstream input handle.
5. Open **Simulation — hypothetical estimates** above the canvas.
6. Set the incoming requests per second, select an entry component, and configure capacity and baseline latency for each node.
7. Optionally set a cache-hit rate or simulate a component failure.
8. Review modeled throughput, dropped requests and utilization, then expand **Model assumptions and limitations**.

The model recalculates immediately when topology or inputs change. No source files are modified; Sandbox inputs are currently ephemeral.

## Model contract

Only nodes with IDs prefixed `sandbox-` participate. Connections to discovered package nodes are explicitly **excluded** and reported in the UI. All other validation rejects cycles, duplicate links, unknown nodes, non-finite inputs and oversized scenarios (100 nodes, 300 connections).

The model supports a directed acyclic graph (DAG):

- At each node, `servedRps = min(incomingRps, capacityRps)`, and `droppedRps = incomingRps - servedRps`.
- Failed nodes have zero capacity. Baseline latency is multiplied by `1 + 2 × utilization²` for a **per-node approximation**, not end-to-end latency.
- Outgoing traffic is split evenly between a node's modeled downstream links. This is a routing assumption, not a detected load-balancing algorithm.
- Cache hits terminate locally, while cache misses continue toward downstream components.
- Output is the sum of request throughput completing at terminal nodes or on cache hits.
- A Queue node currently uses the same capacity/drop model as other components. **Buffering, retries, queue depth and worker semantics are not implemented**.

## Why this cannot be interpreted as production data

Project `package.json` dependencies cannot reveal network requests, application traffic, service capacity or failure rates. The simulation uses **only manually proposed topology and values**; its results are reproducible estimates under the listed assumptions.

This initial simulation does not include fan-out duplication, propagation delays, independent distributions, burst traffic, backpressure, autoscaling, retries or measured real-world SLOs.

## Testing

`apps/web/src/simulation.test.ts` includes deterministic regressions for throughput propagation, capacity limits, cache hit behavior, failure, cyclic topology and source-isolation rules.

Run `pnpm check` for all repository validation. This PR must also pass visual interaction testing in a real browser before merging.
