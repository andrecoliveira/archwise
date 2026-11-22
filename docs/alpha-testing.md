# Archwise Alpha — Local test guide

> **Development preview:** this runs from the `main` branch source; it is not a published npm release. The core is local-first and works without a cloud login or external AI account. Please do not describe it as a stable public release.

## Prerequisites

- Node.js 24 or 26 (Node.js 26 recommended).
- pnpm 10.34.9, via Corepack or another trusted package manager.
- A local Node.js/TypeScript project containing one or more `package.json` files.
- Linux, macOS or Windows with a modern browser.

## Test Architecture Studio

```bash
git clone https://github.com/andrecoliveira/archwise.git
cd archwise
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
node apps/cli/dist/bin.js --serve --path /absolute/path/to/your/project
```

On Windows, use the equivalent absolute path, e.g. `C:\\work\\example`, and run the commands in a terminal where Node and pnpm are available.

The CLI starts a server bound to `127.0.0.1` on an available port. If the browser does not open automatically, copy the **Local session URL** printed in the terminal into the browser. The URL includes a sensitive one-time local session capability: do not share it.

## Inspect the graph using the CLI

```bash
node apps/cli/dist/bin.js --path /absolute/path/to/your/project --graph
```

Without a flag, the CLI prints a summary: manifests, entries and repositories, a count per skip reason, and a warning if a budget truncated the scan. Ctrl+C cancels a scan with exit code 130. See [Discovery](discovery.md#safe-inventory) for the skip reasons and budgets.

To see several repositories as one system, pass `--repo` once per repository, for example `--repo /work/api --repo /work/web`, or list them in a workspace file and pass `--workspace <file>` ([Discovery](discovery.md#several-repositories)).

Use `--json` for the inventory instead of the graph, or `--serve --no-open` to avoid automatic browser launch. Both JSON outputs use repository-relative paths and omit the absolute project root. They still contain your package names, so review them before sharing.

## What to verify

1. The browser opens to the Architecture Studio with discovered packages and their declared internal dependencies.
2. Selecting a component shows the relative-path manifest evidence in the inspector. With several repositories, each package shows its repository label, the inspector shows the repository, and the header's **Scan** summary lists each repository's counts.
3. The search filter narrows visible packages and edges.
4. Zoom, pan and automatic layout work on the Svelte Flow canvas.
5. Switching to Sandbox permits proposed nodes and connections, visibly distinct from discovered items.
6. Switching back to Explore shows the source-backed graph without the proposed items.
7. In Sandbox, build a proposed topology, then set hypothetical load, capacity, cache-hit ratios and simulated failure in the Simulation panel. Check the displayed assumptions and results.
8. Confirm that connections involving discovered packages are excluded from the simulation and a cyclic proposed topology reports a validation error.
9. Save the current hypothetical simulation as scenario A, modify the Sandbox topology and inputs, then save scenario B. Compare modeled output, bottlenecks and per-node differences. Replace B to compare another design.
10. Verify that A/B snapshots survive switching to Explore and back **and persist after page reload**. The header indicator should read **All changes saved**. Stop the server, start it again, open **Sessions** and **Resume** the previous session (or start with `--resume latest`). Its components and snapshots must return.
11. Export the Sandbox as versioned JSON; reset it; import the JSON and verify your components, parameters, and A/B snapshots are restored. Invalid files must not replace the current design.
12. The Architecture Coach panel shows offline contextual questions.
13. Stop the local server with Ctrl+C. No project files should have been modified.

## Current limits and safety

- Discovery currently covers Node package manifests and explicitly declared dependencies between uniquely identified local packages. It does **not** infer a live runtime system, traffic flows, databases or deployed infrastructure.
- Sandbox topology, simulation inputs and saved A/B snapshots are autosaved to sessions in the local store outside the project. You can resume them from **Sessions**, `--resume` or `--sessions`, and disable the store with `--no-store`; see [Sessions](sessions.md). A resumed session shows the graph as it was; rebasing onto newer discoveries is future work. The offline Coach question index is not persisted. See [Sandbox persistence](sandbox-persistence.md) and [Scenario comparison](scenario-comparison.md).
- A deterministic Sandbox simulation is available, but it **does not measure production traffic**. It assumes a single entry node, evenly split routing across proposed links, a DAG topology, no retries and modeled capacity drops. See [Simulation assumptions](simulation.md).
- There is no npm-published `npx archwise` package yet; use the compiled CLI.
- The current build includes ELK and Svelte Flow and is not yet bundle-size optimized.
- Default analysis reads project files; it never executes scripts from the inspected repository. No cloud account or remote AI is required.
- Browser access requires a one-time local session URL; do not share the URL or browser session cookie.

## If the local store fails

Archwise never deletes your sessions to recover. When the store is corrupt it moves the file aside, starts a fresh store and prints where the old file is. When the store was written by a newer Archwise, or an upgrade fails, it exits with code 2 and leaves the file untouched. It also exits with code 2 when the data directory is not writable. Run with `--no-store` to keep inspecting without sessions, or set `ARCHWISE_DATA_DIR` to use another directory. The full table is in [Sessions: recovery and failures](sessions.md#recovery-and-failures).

## Verified automated checks

The `main` branch passes the full `pnpm check` matrix on Linux, macOS and Windows using Node 24 and Node 26, including an authenticated HTTP smoke test of discovery → graph → server → compiled Studio assets. The `Browser Studio Smoke` workflow also exercises the Studio in headless Chromium on Ubuntu (see [Browser QA](browser-qa.md)). **Visual review, touch input, Safari/Firefox and OS-specific browser launch are still verified manually.**

The Alpha was reviewed and merged in [PR #6](https://github.com/andrecoliveira/archwise/pull/6). See [GitHub Actions](https://github.com/andrecoliveira/archwise/actions) for current CI status.

## Feedback

When testing, note the OS and Node version, the number of detected packages, any errors/diagnostics, and whether the original source files remained unchanged. Never share repository secrets, local session URLs, or sensitive source files in public bug reports.
