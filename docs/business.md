# Optional open-core business strategies

The business model must reinforce, not undermine, the local-first open-source core. No commercial plan is required to use discovery, graph inspection, sandboxing, deterministic simulation, local persistence, exports, or user-supplied AI providers.

## Recommended strategy: hosted collaboration around an open core

Keep the single-user engine and portable formats open. Offer a hosted control plane for teams that want encrypted synchronization, shared reviews, comments, organization policy, SSO/SCIM, audit logs, managed retention, and integration administration. Self-hosted team capabilities can be offered under a commercial license without making local use dependent on license checks.

Advantages: clear value boundary, low lock-in, community-verifiable security, and a natural upgrade for teams. Risk: collaboration must add enough value without artificially crippling the core.

## Complementary revenue options

- Managed AI gateway with budgets, redaction policy, evaluation, and consolidated billing; bring-your-own-provider remains supported.
- Enterprise support, onboarding, custom analyzers, architecture workshops, and compliance assistance.
- Curated proprietary analyzer packs for specialized enterprise ecosystems, while the analyzer SDK and core adapters remain open.
- Managed benchmarking or governance dashboards built from explicitly uploaded, minimized metadata.

## Alternatives and trade-offs

An all-hosted SaaS simplifies centralized collaboration but conflicts with offline and source-privacy requirements. A fully paid desktop app simplifies packaging but reduces community adoption and external analyzer contributions. Usage-based AI alone has weak differentiation and volatile margins. These can be optional channels, not the product's foundation.

## Guardrails

- No source upload, account creation, telemetry, or online license check for core workflows.
- Portable, documented formats and working export prevent data lock-in.
- Commercial features operate through public, versioned interfaces rather than private forks of core formats.
- Pricing boundaries are based on team operations and managed services, not repository size or access to a user's own data.
- The project must choose and publish an open-source license before marketing the core as open source. A contributor agreement or DCO policy should be decided transparently.

## Metrics that respect privacy

Prefer opt-in business metrics from hosted services: activated organizations, weekly collaborative reviews, retained teams, managed-provider usage, and conversion to support. Local product analytics remain disabled by default; product learning can rely on consented research, public issues, and explicitly shared diagnostic summaries.
