# Block 10.1 — Modeled per-replica service capacity

This is the first small increment toward Simulation Engine v2. Replica counts are **hypothetical inputs**, not deployed infrastructure or measured autoscaling behavior.

## What is implemented

- **App Server**, **Worker** and legacy generic Service nodes can be assigned **1–16 replicas** in the selected node Inspector or the Simulation drawer. Client and Load Balancer presets do not expose replica scaling; Database, Cache and Queue do not gain new replication behavior.
- The existing `Capacity` setting is interpreted as **requests per second per replica** for these eligible processors. Their effective deterministic capacity is `min(1,000,000, perReplicaRps × replicas)`, limited by the simulator's maximum modeled input range.
- The custom node displays replica count when greater than one; node utilization, served/dropped RPS, A/B snapshots and bottleneck feedback use the effective modeled capacity.
- Replica counts are saved in `draft.replicas` within the existing **archwise-sandbox JSON version 1**. Imports from before this feature simply default to one replica. Invalid fractions, values outside 1–16, unknown node IDs and replica counts on unsupported component types are rejected.
- No API, discovered code or project source file is modified.

## Worked example (deterministic model, not production forecast)

Create App Server → SQL Database. Configure the **App Server as the scenario entry**, with 200 incoming RPS, 100 RPS capacity per App replica and 175 RPS modeled SQL capacity.

| Modeled configuration | App aggregate capacity | Modeled completion rate | Binding constraint |
| --- | ---: | ---: | --- |
| Scenario A: 1 App replica | 100 RPS | 100 RPS | App Server |
| Scenario B: 3 App replicas | 300 RPS | 175 RPS | SQL Database |

The A/B comparison shows **+75 modeled completed requests/second**. Adding more App replicas cannot lift throughput beyond the configured database capacity in this simple sequential topology. This is an illustration of shifting bottlenecks, not a real scale-out prediction.

## What replica count does NOT model

- Real HTTP load-balancer algorithms, affinity, session routing, client source behavior, concurrency, CPU/memory contention, network bandwidth or autoscaling delay.
- Per-replica failures, quorum, failover, replica availability, service uptime, p95/p99 or error budgets.
- Queue buffering and worker-consumption rates; a Worker preset is modeled as a capacity-only service processor.
- Nonlinear scaling. Linear multiplication is an **explicit simplifying assumption**.

Only proposed nodes participate in the simulator. The model still splits outbound throughput equally across links and is not an architectural production telemetry system.

## Test and validation

- Unit tests cover valid/invalid replica counts, excluded presets, capacity math and the 1m-RPS ceiling.
- Persistence tests cover legacy v1 imports, valid replica JSON round trips and rejection of unsupported replica settings.
- The real `Browser Studio Smoke` workflow creates App/DB nodes, selects the App entry, saves A with one replica and B with three, validates the +75 RPS difference and verifies that replicas and snapshots persist across reload and JSON export/import.
- A successful `pnpm check` and browser smoke validate code and the modeled interaction. Manual UX review still matters, especially drag-to-connect and responsive positioning.

See [Browser QA](browser-qa.md), [Simulation assumptions](simulation.md), and [Alpha testing](alpha-testing.md).
