# Block 8 — Local Sandbox persistence and versioned JSON

Archwise persists **only hypothetical Sandbox content**, as a versioned JSON document. It is autosaved to the current session in the local store outside your project (see [Sessions](sessions.md)). Discovery and source code remain untouched.

## Using the feature

1. Run the [local Alpha](alpha-testing.md), open the Architecture Studio and enter **Sandbox**.
2. Add proposed components, set their capacities and other simulation values, connect proposed nodes and optionally save scenarios A and B.
3. Changes are saved automatically to the current session in the local store. A page reload restores them, and later launches can resume the session from **Sessions** or with `--resume`. Browser `localStorage` is no longer used.
4. Select **Export JSON** to download `archwise-sandbox-v1.json`. It contains only proposed node IDs, names, types, approximate canvas positions, proposed-to-proposed connections, simulation parameters and saved A/B snapshots.
5. Select **Import JSON** to choose the file. The import validates format, version, project signature, IDs, bounds, numeric values and simulated topology *before replacing the current Sandbox*. If validation fails, nothing is replaced.
6. **Reset Sandbox** clears current hypothetical components and simulation inputs but intentionally retains saved A/B snapshots for later comparison. Use **Clear snapshots** in the Simulation panel to clear those too.

## Safety and limitations

- Everything stays local. No cloud account, remote API or source modification is involved.
- The file format is `{ format: "archwise-sandbox", version: 1, projectSignature, nodes, connections, draft }`.
- The project signature is a deterministic, non-cryptographic identifier from the evidence-backed package graph. It is not a source-code hash. An imported file from a different discovered graph is rejected.
- If two projects have identical discovered package graphs, a Sandbox file exported from one can be imported into the other. Empty-discovery projects share a generic scratchpad signature. Saved sessions are kept per project root, so they never mix.
- The imported file must be 256 KiB or less. Maximums: 100 proposed nodes and 300 proposed connections.
- Only proposed-to-proposed links are stored in this format. Visual links from proposed to discovered package nodes remain transient, because package dependencies are not runtime network traffic.
- Snapshot A/B comparisons are educational model estimates, never observed production metrics.
- The local store can be disabled (`--no-store`) or deleted by the user; an exported JSON file is the portable backup.
- Automated tests verify round trips and reject malformed, oversized, foreign-project, cyclic and invalid files. The real-browser smoke test covers autosave, reload, export download and import (see [Browser QA](browser-qa.md)).

## Testing

```bash
pnpm check
node apps/cli/dist/bin.js --serve --path /absolute/path/to/project
```

Then create an A/B comparison, refresh the browser, and confirm it is restored. Export it, reset the Sandbox, import the file and confirm the numbers match. Try an invalid or unrelated project file and verify the current Sandbox is preserved.
