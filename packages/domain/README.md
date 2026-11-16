# @archwise/domain

Pure graph contracts with no runtime dependencies, filesystem, clock or randomness.

- `graph.ts`: the `archwise.graph` v1 vocabulary. It covers repositories, evidence, analyzer coverage, nodes, edges, diagnostics, `GraphRevision` and the safety `LIMITS`.
- `primitives.ts`: validators for IDs, codes, labels, timestamps and relative paths, known secret-pattern and home-directory detection, `redactSensitiveText` for adapters, and code-unit ordering.
- `validation.ts`: `validateRevision` returns stable error codes with structural paths and never echoes rejected values.
- `revision.ts`: `createRevision` copies the input, validates it and returns a canonical, deeply frozen revision. `canonicalizeRevision` applies the deterministic ordering.
- `sandbox.ts`: `bindSandbox` checks that a readonly sandbox reference matches its base revision. Operation logs are not part of this package yet.

Labels that contain a known secret shape (`secret-pattern`) or a generic home-directory path, `/Users/<name>` or `C:\Users\<name>` (`home-path`), are rejected. `redactSensitiveText` also accepts the running user's home directories, so adapters can redact Linux homes without flagging route labels such as `/home/feed`. These checks are defense in depth, not proof that a label or path contains no sensitive data.

Public exports live in `src/index.ts`. Tests live in `tests/`. Run `pnpm --filter @archwise/domain test` from the root. Build dependencies first with `pnpm build`.
