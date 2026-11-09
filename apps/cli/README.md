# cli

Pure argument handling plus an explicit executable entry point. Help and version work; repository discovery does not.

Source lives in `src/`. Tests ship alongside the package and run with `pnpm --filter @archwise/cli test`. Public package exports (where applicable) point only to built `dist/index.js` and its declarations.
