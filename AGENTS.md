# Agent operating guide

These instructions apply to human-assisted agents and subagents working anywhere in this repository.

## Start here

1. Read `README.md` and the documents relevant to the task.
2. Inspect the current tree, tests, package manifests, and recent commits before proposing changes.
3. Treat `docs/product-specification.md` and accepted ADRs as the product contract.
4. Distinguish clearly between specified, implemented, and verified behavior.

## Non-negotiable invariants

- Keep the core local-first and useful without authentication, telemetry, cloud storage, or an AI provider.
- Never execute discovered project code during default analysis. Static parsing and manifest inspection are the default.
- Never send source, secrets, file contents, or full graph payloads to a remote model without explicit, informed user action.
- Preserve the discovered real graph as evidence-backed and immutable. Put hypotheses and user edits in a separate sandbox overlay.
- Every inferred entity and relationship must be traceable to evidence and include confidence and diagnostics.
- Do not write into analyzed repositories unless the user explicitly invokes a future export/apply workflow and reviews its target.
- Keep provider integrations behind interfaces. No core domain package may depend directly on a specific AI vendor.

## Working method

- Use a feature branch; never implement directly on `main`.
- Prefer small, reversible commits and focused pull requests.
- Write or update tests with behavioral changes. Run narrow tests first, then the complete affected suite.
- Update documentation and ADRs in the same PR when behavior, data formats, security boundaries, or CLI contracts change.
- Do not add dependencies without explaining why the standard library or an existing dependency is insufficient.
- Avoid logging file contents, prompts, credentials, environment-variable values, or raw provider responses.

## Delegating to subagents

The coordinating agent owns the final result. Delegate only bounded work with explicit inputs, outputs, allowed files, and verification commands.

- Give each subagent one coherent responsibility and enough context to work independently.
- Avoid concurrent edits to the same files. Partition by package or document when parallel work is safe.
- Require subagents to report assumptions, files changed, commands run, results, and unresolved risks.
- Review diffs and rerun verification yourself; never accept a completion claim solely from a subagent.
- Subagents must follow this file and any more specific nested `AGENTS.md`.

## Architecture boundaries

Expected dependency direction:

```text
apps/cli ───────┐
apps/server ────┼──> packages/application ──> packages/domain
apps/web ───────┘             │
                              ├──> packages/discovery
                              ├──> packages/simulator
                              ├──> packages/storage
                              └──> packages/ai
```

Adapters may depend on domain contracts. The domain must not import React, Node filesystem APIs, databases, or provider SDKs. The web UI consumes versioned application APIs and shared schemas; it does not inspect the filesystem directly.

## Definition of done

- Acceptance criteria are covered by tests or an explicitly documented manual check.
- Formatting, type checking, unit tests, integration tests, and security-relevant checks pass for affected areas.
- Error states preserve user data and provide actionable diagnostics.
- No secrets, machine-specific absolute paths, generated caches, or analyzed source snapshots are committed.
- Documentation matches delivered behavior and does not describe proposals as implemented facts.
