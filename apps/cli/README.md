# cli

Argument parsing (`--path`, repeated `--repo`, `--workspace` files), composition of the read-only inventory from `@archwise/discovery` (per-repository summary, `--json` v2, progress and Ctrl+C cancellation), evidence-backed package graph construction and the protected loopback HTTP server that serves the Studio and the scan summary at `/api/v1/scan` (`--json`, `--graph`, `--serve`, `--no-open`). It never executes or imports code from the inspected project.

With `--serve`, it also records the discovered graph as an `archwise.graph` revision and serves the protected session API (see `docs/sessions.md`). `--sessions` lists saved sessions, `--resume latest|SESSION_ID` continues one, and `--no-store` disables the local store.

Inventory, graph and server logic live here temporarily during the Alpha; ADR 0005 records the planned extraction into discovery, domain/schemas and server packages.

Source lives in `src/`. Tests ship alongside the package and run with `pnpm --filter @archwise/cli test`. Public package exports (where applicable) point only to built `dist/index.js` and its declarations.
