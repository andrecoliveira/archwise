# Archwise

Archwise is a proposed local-first, open-source workspace for discovering, understanding, explaining, and safely experimenting with software architecture.

> **Project status:** specification and planning. The repository does not yet contain a working product. Documents use normative language to define intended behavior, not to claim implemented features.

The product starts from code already on a developer's machine. From a selected working directory, Archwise discovers one or more repositories, builds an evidence-backed architecture graph, opens it in a browser, and lets the user explore a separate sandbox without changing source code. An optional AI interviewer acts like a system-design recruiter: it asks focused questions, challenges assumptions, and turns answers into reviewable suggestions.

## Principles

- **Local-first:** source code and derived architecture data remain on the user's machine by default.
- **Open-source core:** discovery, graphing, browser exploration, sandboxing, and deterministic simulation are usable without an account or paid service.
- **Evidence over guesses:** every inferred node and edge carries provenance, confidence, and diagnostics.
- **Real graph stays immutable:** experiments happen in a separate sandbox layer and never masquerade as discovered facts.
- **AI is optional:** the product works without a model provider; users explicitly configure local or remote providers.
- **Safe by default:** static inspection is read-only, secrets are redacted, and project code is never executed implicitly.

## Intended experience

1. Run Archwise from a project directory or explicitly pass one or more paths.
2. Review detected repositories, packages, services, data stores, APIs, queues, and infrastructure.
3. Open the browser workspace with the discovered system design already loaded.
4. Inspect evidence and confidence for each architectural claim.
5. Fork the real graph into a sandbox, propose changes, and compare scenarios.
6. Use deterministic simulations and the optional interviewer/coach to expose trade-offs.
7. Export a portable architecture snapshot without modifying the repositories.

## Documentation map

- [Product specification](docs/product-specification.md)
- [Architecture and local data flow](docs/architecture.md)
- [Automatic discovery and multi-repository workspaces](docs/discovery.md)
- [Real graph, sandbox, and provenance model](docs/graph-and-sandbox.md)
- [Simulation model](docs/simulator.md)
- [AI interviewer and coach](docs/ai-coach.md)
- [Security and privacy](docs/security.md)
- [MVP scope and delivery phases](docs/mvp.md)
- [End-to-end implementation roadmap](docs/implementation-roadmap.md)
- [Proposed code organization](docs/code-organization.md)
- [CI/CD and release strategy](docs/ci-cd.md)
- [Optional open-core business strategies](docs/business.md)
- [Architecture decision](docs/decisions/0001-local-first-open-source.md)
- [Original README preserved as history](docs/history/README-saas-original.md)

## Contributing

Start with the [contribution guide](CONTRIBUTING.md) for the current workflow and verification instructions.

The specification is the current source of truth. Before implementing a feature, read [AGENTS.md](AGENTS.md), identify the relevant document, and propose an ADR when changing an invariant or major boundary. Keep local-only workflows functional and do not make a cloud account a prerequisite for core features.

## License

No license has been selected yet. Until a license file is added, copyright remains with the repository owner and the code is not legally open source despite the intended direction. Choosing an OSI-approved license is an explicit MVP prerequisite.
