# Block 9.4 — Semantic connection UX and manual node placement

This block improves the **Sandbox drawing interaction**. It does not claim to reproduce the original playground's traffic engine, SLO metrics, or its complete obstacle-avoiding edge routing.

## What changed

- Semantic Sandbox links use a dedicated **ArchitectureEdge** component with rounded orthogonal routing via Svelte Flow `getSmoothStepPath`, colored directional arrowheads, and clickable REQ/CACHE/DB/ASYNC/WORK badges.
- Selected connections remain editable in the **Connection intent** panel; the type has a short explanation. Connection intent is still architectural metadata, **not** a distinct traffic-propagation rule.
- Proposed-to-proposed links are validated before being added. Self-connections, duplicate directed links and cycles are rejected with feedback; links to discovered package nodes remain unavailable in Sandbox. Cyclic rejection matches the current deterministic simulator's DAG requirement.
- **Manual node positions are recorded on drag stop**. Switching Explore/Sandbox, editing a component, and reloading the browser should preserve them.
- **Auto layout** stays available as an explicit action; adding or editing a proposed component does not automatically re-arrange the Sandbox.
- Clicking the blank canvas closes contextual selection and messages. Handles remain directionally left-in / right-out.

## Manual browser acceptance test

1. Launch the [Alpha Studio](alpha-testing.md) and add Client, App Server and SQL Database.
2. Connect Client output → App Server input, then App Server output → Database input. Confirm colored semantic badges and arrowheads.
3. Select the App Server → Database `DB` label, switch to `REQ` to observe its meaning, and restore `DB`. The model remains hypothetical and the connection direction unchanged.
4. Attempt another App Server → Database link; expect an explanatory duplicate message.
5. Attempt a Database → Client link, which would create a cycle; expect a warning rather than an invalid persisted topology.
6. Drag the nodes into your preferred positions. Edit a component capacity, switch to Explore and back, then reload. Confirm the node positions are maintained.
7. Press Auto layout to opt into an automatic arrangement. Export and reimport JSON; verify edge intent and node positions.
8. Confirm selecting an edge is easier by clicking its badge, and clicking the blank canvas clears selection.

## Known limitations

- Rounded orthogonal edges can **still overlap nodes or cross one another** in dense or manually arranged diagrams. Global obstacle avoidance and automated route-label deconfliction require a future dedicated routing pass.
- The default Svelte Flow connection handle interaction needs actual browser validation across mouse and touch.
- No measured traffic, real availability, p95/p99 or error-budget burn is inferred from these visual edge labels.
- The project analyzer and its read-only discovered evidence are unchanged.

## Automated validation

`pnpm check` passed for this implementation on Linux, macOS and Windows using Node.js 24 and 26. **73 Vitest tests + 12 Node-native tests** passed; Svelte check reported zero errors and warnings.

The [browser smoke test](browser-qa.md) now automates the connection, edge-intent and persistence steps above. Drag-to-connect and obstacle-avoiding routing remain known limitations.
