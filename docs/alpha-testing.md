# Archwise Alpha — Local test guide

> **Development preview:** this is a feature branch, not a published npm release. The core is local-first and works without a cloud login or external AI account. Please do not report this branch as a stable public release.

## Prerequisites

- Node.js 24 or 26 (Node.js 26 recommended).
- pnpm 10.34.9, via Corepack or another trusted package manager.
- A local Node.js/TypeScript project containing one or more `package.json` files.
- Linux, macOS or Windows with a modern browser.

## Test Architecture Studio

```bash
git clone --branch feat/svelte-flow-migration https://github.com/andrecoliveira/archwise.git
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

Use `--json` for the inventory instead of the graph, or `--serve --no-open` to avoid automatic browser launch.

## What to verify

1. The browser opens to the Architecture Studio with discovered packages and their declared internal dependencies.
2. Selecting a component shows the relative-path manifest evidence in the inspector.
3. The search filter narrows visible packages and edges.
4. Zoom, pan and automatic layout work on the Svelte Flow canvas.
5. Switching to Sandbox permits proposed nodes and connections, visibly distinct from discovered items.
6. Switching back to Explore shows the source-backed graph without the proposed items.
7. The Architecture Coach panel shows offline contextual questions.
8. Stop the local server with Ctrl+C. No project files should have been modified.

## Current limits and safety

- Discovery currently covers Node package manifests and explicitly declared dependencies between uniquely identified local packages. It does **not** infer a live runtime system, traffic flows, databases or deployed infrastructure.
- Sandbox changes and interview progress currently live in memory; they are not persisted across restarts.
- There is no production-traffic simulation integrated into this GitHub branch yet.
- There is no npm-published `npx archwise` package yet; use the compiled CLI.
- The current build includes ELK and Svelte Flow and is not yet bundle-size optimized.
- Default analysis reads project files; it never executes scripts from the inspected repository. No cloud account or remote AI is required.
- Browser access requires a one-time local session URL; do not share the URL or browser session cookie.

## Verified automated checks

The feature branch passed the full `pnpm check` matrix on Linux, macOS and Windows using Node 24 and Node 26, including an authenticated HTTP smoke test of discovery → graph → server → compiled Studio assets. **Visual interaction in a real browser and OS-specific browser launch still require manual verification.**

See [PR #6](https://github.com/andrecoliveira/archwise/pull/6) for code review and [GitHub Actions](https://github.com/andrecoliveira/archwise/actions) for current CI status.

## Feedback

When testing, note the OS and Node version, the number of detected packages, any errors/diagnostics, and whether the original source files remained unchanged. Never share repository secrets, local session URLs, or sensitive source files in public bug reports.
