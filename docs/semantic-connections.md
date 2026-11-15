# Block 9.1 — Semantic connections and modeled canvas feedback

This first increment draws on the user-supplied visual reference of a URL-shortener System Design challenge. It **does not** import the reference site's model, SLO math, colors, or UI components.

## Workflow in the Architecture Studio

1. Run the [local Alpha](alpha-testing.md), choose **Sandbox**, and create proposed components.
2. Connect two **proposed** components. Archwise suggests an intent based on the source/target kinds:
   - `REQ` — synchronous request, default for service-to-service.
   - `CACHE` — cache operation, suggested when targeting a cache.
   - `DB` — database operation, suggested when targeting a database.
   - `ASYNC` — publish to a queue.
   - `WORK` — consume work from a queue.
3. Click the proposed edge to open the **Connection intent** editor. Change the intent or remove the connection.
4. The edge displays a short label and a distinct line color. Incompatible source/target semantics show an explicit warning with a suggested correction.
5. Configure load, capacity, cache-hit rate and failure in **Simulation**. Proposed nodes display modeled utilization, loss, bottleneck or failure feedback. Select a node for the evidence behind its modeled status.
6. Export the Sandbox as JSON and import it to confirm types persist. Historical v1 JSON without an intent field remains accepted; legacy connections display the default `REQ` intent.

## Architectural limits

- **Connection intent is currently visual metadata.** The deterministic simulator still divides modeled outbound traffic evenly among proposed links. Choosing `DB`, `CACHE`, `ASYNC` or `WORK` does not magically create realistic runtime requests, cache-miss behavior or worker throughput.
- Only **proposed-to-proposed links** can be created in this slice. The previous UI allowed proposed-to-discovered links that were subsequently ignored by simulation and serialization. This explicit restriction prevents silent data loss.
- The default node cards remain the Svelte Flow base node. Specialized component cards, multiple handles, advanced edge routing, canvas animation and replica controls are future increments.
- Reported RPS, utilization, losses and failure states are **educational model outputs**, not production metrics. The model does not claim p95, p99, availability or error-budget burn.
- Existing `archwise-sandbox` JSON **version 1** is backwards compatible through the optional `connections[].intent` field. Unknown intent values are rejected; older documents without the field retain default visual `REQ`.
- There is no generic recommendation to add a load balancer; the new feedback describes the affected component and configured capacity rather than assuming any missing infrastructure.

## Acceptance tests

- The connection-intent tests cover suggestions, five supported values, and incompatible pairings.
- Persistence tests cover typed JSON round-trips, legacy v1 imports, and invalid intent rejection.
- Canvas-feedback tests cover bottlenecks, dropped RPS, simulated failures, near-capacity warning and idle state.
- Run `pnpm check` and manually test edge selection/editing and node feedback in a browser. Edge selection and editing are also covered by the automated [browser smoke test](browser-qa.md).

## Next increment

Introduce a typed component catalog and dedicated Svelte Flow custom nodes with input/output handles and local replica configuration. Add topology-aware simulation semantics only after the engine has explicit, tested rules.
