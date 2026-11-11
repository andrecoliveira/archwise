# server

Immutable health metadata only. There is no HTTP listener until capability/origin controls are implemented together.

Source lives in `src/`. Tests ship alongside the package and run with `pnpm --filter @archwise/server test`. Public package exports (where applicable) point only to built `dist/index.js` and its declarations.
