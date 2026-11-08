# ADR 0001: Local-first open-source core

- Status: Proposed
- Date: 2026-11-08

## Context

Archwise needs access to sensitive source code and architecture metadata. Requiring cloud upload or a SaaS account would limit trust, offline use, and adoption. At the same time, teams may eventually value managed collaboration and governance.

## Decision

Build the core as a local Node.js/TypeScript application with a React browser UI and portable, versioned data formats. Discovery, inspection, sandboxing, deterministic simulation, and user-configured model providers belong to the open-source core. Data remains local unless the user deliberately invokes an external provider or future synchronization feature.

Use a loopback application service instead of placing filesystem authority in the browser. Treat the discovered graph as immutable evidence and represent experiments as sandbox overlays. Keep cloud services and commercial team capabilities optional and interoperable with open formats.

This ADR remains `Proposed` until the repository owner selects an OSI-approved license and accepts the architecture as the implementation baseline.

## Consequences

- The core must be fully testable with networking disabled.
- Provider and hosted integrations require explicit interfaces and consent boundaries.
- Local security, migrations, packaging, and cross-platform behavior become first-class work.
- Hosted revenue must come primarily from collaboration, governance, managed operations, and support—not withholding access to local project data.
- Portable formats reduce lock-in and require compatibility discipline.

## Rejected alternatives

- **Cloud-first SaaS:** easier centralized operations, but source upload and account requirements violate the intended trust model.
- **Pure browser application:** insufficient safe filesystem access and background analysis capabilities.
- **Electron-only desktop:** possible later packaging, but making it foundational would couple core logic to a heavy shell; the local service plus browser is the initial baseline.
- **AI-generated graph as source of truth:** non-deterministic, difficult to audit, and unsafe against repository prompt injection. AI remains an optional interpreter and coach.
