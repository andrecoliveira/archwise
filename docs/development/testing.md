# Foundation development

Use Node 26 (see `.nvmrc`) and pnpm 10.34.9. Node 24 is also targeted by CI.

Install the pinned package manager using your normal package-manager setup, or invoke `npx --yes pnpm@10.34.9`. Installing dependencies needs network access unless cached.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm check
```

`pnpm check` runs formatting, dependency-ordered builds, strict type checking, and tests. Build comes before tests because application imports domain through its public built entry point. For focused tests, first run `pnpm build`, then `pnpm --filter @archwise/schemas test`.

The current tests cover supported envelope versions, missing and invalid values, rejection of unknown fields, and immutable application metadata. They do not validate complete graphs or user workflows.

Packages are private during bootstrap. They expose ESM code and declarations under `dist`. Generated output, dependencies and build cache are ignored. Each package README describes its responsibility.

Formatting currently covers tooling and packages; pre-existing specification documents and the canonical license are kept untouched. Linting, import-boundary enforcement, UI/browser tests, and extended security automation are not implemented yet.

CI defines Linux, macOS and Windows checks on Node 24/26. Local success alone is not evidence that all matrix jobs pass.
