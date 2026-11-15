# Block 9.5 — Real-browser Studio acceptance

A successful `pnpm check` proves the Svelte application builds, but does **not** prove the canvas works when a person clicks it. This block adds an automated Chromium smoke test of the actual locally served Architecture Studio.

## Real browser scenarios covered

The test at `scripts/browser-smoke.mjs`:
1. Starts the built CLI in local protected `--serve --no-open` mode and opens its one-time session in headless Chrome, without printing the private session token.
2. Uses the **component catalog** to add Client, App Server and SQL Database.
3. Renames SQL Database and changes its modeled capacity in the **contextual inspector**.
4. Connects Client → App Server → SQL Database using **real Svelte Flow handles** and checks two edges are present. It tries dragging and falls back to clicking output then input if needed.
5. Clicks the `DB` edge label and changes its intent to `REQ` and back to `DB`.
6. Verifies the browser's persisted document includes node names, capacity and typed links.
7. Reloads the page, switches to Explore and back, and confirms the design is restored.
8. Drags a custom node and checks its new position is saved in the JSON state.
9. Downloads an exported JSON file, clears the canvas, imports that exact file, and checks the original nodes and links return.
10. Fails on uncaught browser JavaScript errors.

## How to execute

The permanent `Browser Studio Smoke` GitHub Actions workflow runs on relevant PR changes and supports manual `workflow_dispatch`. It uses **Ubuntu 24.04** with an installed Chrome binary and installs an isolated, pinned Playwright driver in the Actions temporary directory, without altering the root `pnpm-lock.yaml`.

The workflow requires `pnpm build` and a functional local CLI + HTTP browser server.

## Findings and limitations

- The first real Chromium run found **overlapping card positions**; an App Server card intercepted clicks intended for the Client's output handle. Initial positions were adjusted and covered with unit tests.
- Clicking an edge badge did not initially open the connection editor; a real accessible button and explicit callback resolved it.
- **Click-to-connect has passed** in Chrome. **Drag-to-connect is still not consistently successful** using the automated pointer gesture. A fallback is visible in the smoke logs; the browser test does not claim that both gestures passed. This remains a separate UX follow-up.
- The smoke test verifies real interactions but is **not a visual design review**, touch-screen QA, obstacle-avoiding route evaluation, or a cross-browser test on Safari and Firefox.
- The simulation remains hypothetical and deterministic. No real p95/p99 latency, availability or traffic telemetry is inferred from these UI actions.

## Reproducing the accepted workflow manually

Launch the [Alpha Studio](alpha-testing.md), add the three example components, **click the green output port and then the blue input port**, edit the DB edge's meaning, rename a node, adjust capacity, export, clear, import and reload.

Keep draft PR #6 unmerged until the desired visual polish and remaining interaction limitations are reviewed.
