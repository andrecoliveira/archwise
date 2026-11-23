# @archwise/analyzers

Built-in architecture analyzers. Each one implements the `Analyzer` contract from `@archwise/application`: a pure, synchronous function over text that discovery has already read within budgets. Analyzers never touch the filesystem, execute code or read deny-listed files. Boundary rules forbid Node built-ins here.

- `catalog.ts`: the curated role, client-library and container-image catalogs.
- `node-roles.ts`: package roles (frontend, service) and infrastructure inferred from client libraries.
- `node-workspace.ts`: workspace membership from `package.json` `workspaces` and `pnpm-workspace.yaml`; Nx and Lerna files are unsupported gaps.
- `docker-compose.ts`: Compose services as data (`image`, `build`, `depends_on` only).
- `prisma-schema.ts`: the `datasource` provider literal.
- `yaml.ts`: the one YAML entry point (core schema, merge keys, unique keys, 100 aliases).
- `index.ts`: `BUILTIN_ANALYZERS`, sorted by ID.

Tests run with `pnpm --filter @archwise/analyzers test`.
