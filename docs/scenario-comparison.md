# Scenario comparison — Alpha, Block 7

Use **Architecture Studio → Sandbox → Simulation** to compare **two explicitly hypothetical designs**.

## Workflow

1. Add a proposed service or other proposed components and connect their handles.
2. Configure the entry component, input RPS, service capacity and failure settings in the Simulation panel.
3. Choose **Save current as A**. The application copies the complete simulated input (component types, capacities, cache rates, failures, connections and entry load).
4. Modify the same Sandbox: add/remove nodes or links, change capacities, simulate an outage or tune the hit rate.
5. Choose **Save current as B**. The panel shows A → B completed requests/second, newly introduced/resolved bottlenecks, and per-node served/dropped deltas.
6. To compare another design, change the Sandbox and select **Replace B with current**. You can replace A too, or clear both snapshots.

A and B are *independent copies*, not references to the live editor state. The comparison remains available when temporarily switching between Explore and Sandbox. These snapshots are autosaved with the Sandbox to the current session in the local store, and can also be exported/imported as versioned JSON. See [Sandbox persistence](sandbox-persistence.md). No source file is modified and no remote service is contacted.

## Interpretation

- Positive throughput delta means B completes more modeled requests per second **under the configured assumptions**, not that the real application got faster.
- Increases/decreases in incoming load or a different entry component trigger explicit comparability warnings; outcomes are not attributable solely to architecture when workload differs.
- Per-node deltas include added, removed and modified components.
- Both snapshots are re-evaluated using the same deterministic simulation version. No real traffic, latency distributions, queue buffering or retries are measured.
- Only explicit proposed nodes prefixed with `sandbox-` enter the model. Manifest-discovered dependencies are **never treated as runtime requests**.

## Verification

Pure comparison tests cover copy isolation, deterministic results, capacity improvements, bottleneck changes, added/removed components, incompatible inputs and invalid/discovered topology.

Use `pnpm check` and then validate the editing experience in a real browser. This is an unreleased Alpha feature on `main`. The A/B flow is covered by the automated [browser smoke test](browser-qa.md).
