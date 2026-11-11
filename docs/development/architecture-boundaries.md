# Architecture boundaries

The public contract of each package is its package.json exports map. Production imports use package names; relative paths are confined to a single package.

## Enforced rules

- Domain imports only its own source. No filesystem, framework, provider or database runtime dependency.
- Application imports its own code, domain and schemas. Concrete adapters belong at composition points.
- Schemas cannot import application, app or infrastructure packages.
- Browser source cannot import Node built-ins.
- Production source cannot import the test-fixtures package.
- Imports cannot bypass another package's exports by targeting its source or dist files relatively.
- Circular, unresolved and undeclared dependencies fail the check.

Run `pnpm build` before `pnpm boundaries`, since named workspace imports resolve built public entry points. The rules are in `.dependency-cruiser.mjs`; the runner enumerates package source directories and excludes test files. This is static analysis: computed runtime module names are not a supported extension mechanism.

Regression tests create isolated temporary synthetic trees and invoke the actual checker. They cover valid internal imports, built-ins with and without the node: prefix, adapter coupling, source and dist bypasses, cycles, unresolved/undeclared imports and browser Node access. They never inject files into contributor source directories.

The private fixture helper is test-only. It validates all input names before writing, owns its generated temporary root, cleans up on failure, and supports idempotent disposal. It is not designed to defend against a hostile process concurrently modifying its temporary directory.
