# test-fixtures

Private synthetic test data helpers. Creates an owned temporary directory, validates portable relative paths before writing and cleans up on errors. Not a sandbox for concurrent hostile processes. Production packages may not import this test helper.

Source lives in `src/`. Tests ship alongside the package and run with `pnpm --filter @archwise/test-fixtures test`. Public package exports (where applicable) point only to built `dist/index.js` and its declarations.
