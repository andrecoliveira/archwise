# server

Immutable health metadata only. The Alpha loopback HTTP server, with session-capability and origin checks, currently lives in `apps/cli` (`src/local-server.ts`); ADR 0005 records its planned move here.

Source lives in `src/`. Tests ship alongside the package and run with `pnpm --filter @archwise/server test`. Public package exports (where applicable) point only to built `dist/index.js` and its declarations.
