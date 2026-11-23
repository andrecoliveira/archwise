# @archwise/analyzers

Built-in architecture analyzers. Each one implements the `Analyzer` contract from `@archwise/application`: a pure, synchronous function over text that discovery has already read within budgets. Analyzers never touch the filesystem, execute code or read deny-listed files. Boundary rules forbid Node built-ins here.

- `catalog.ts`: the curated role, client-library and container-image catalogs.
- `node-roles.ts`: package roles (frontend, service) and infrastructure inferred from client libraries.

Tests run with `pnpm --filter @archwise/analyzers test`.
