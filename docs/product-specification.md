# Product specification

## Problem

Architecture documentation is usually stale, manually drawn, or detached from code. Existing analysis tools often expose raw dependency graphs rather than helping a developer explain a system, test a design hypothesis, or practice the trade-off discussion expected in a system-design interview.

Archwise turns local code and configuration into an inspectable architectural model, then separates observed reality from hypothetical changes. It supports individual understanding first; collaboration and hosted services remain optional extensions.

## Target users

- Developers onboarding to an unfamiliar codebase.
- Maintainers evaluating architectural changes across repositories.
- Candidates practicing system-design reasoning against a real project.
- Technical leaders documenting boundaries, risks, and decisions.

## Product contract

Archwise must:

1. Start from the current working directory by default and accept explicit paths for multi-repository workspaces.
2. Discover relevant architecture through static, non-executing inspection.
3. Launch a browser workspace with the current architecture already present.
4. Show what is observed, inferred, unknown, or user-proposed.
5. Preserve evidence and confidence for architectural claims.
6. Keep experiments in an independent sandbox overlay.
7. Simulate scenarios deterministically before offering AI interpretation.
8. Provide an optional interviewer/coach that asks one focused question at a time.
9. Work without a user account, network access, telemetry, or AI credentials.
10. Store project data locally by default and offer explicit export/import.

## Primary workflow

### Inspect

The CLI resolves the workspace, finds repository boundaries and manifests, selects analyzers, and builds an initial snapshot. A local application server then opens a browser route for that snapshot. Discovery continues incrementally; the UI displays progress and partial, valid results rather than a blank loading screen.

### Understand

Users navigate coordinated views: system context, containers/services, components/modules, deployment/runtime, and data flow. Selecting an item shows evidence, source location, confidence, analyzer diagnostics, and relevant relationships. Filters control repositories, environments, relation types, and confidence thresholds.

### Experiment

A user creates a sandbox from a specific real-graph revision. Edits create overlay operations such as add node, remove edge, replace component, or change an attribute. The real graph remains untouched. A comparison view explains additions, removals, replacements, and resulting metric changes.

### Practice and decide

The simulator evaluates traffic, failure, latency, cost, and scaling assumptions using explicit input parameters. The optional coach asks for missing requirements, challenges bottlenecks and failure modes, and scores reasoning using a visible rubric. AI suggestions become proposals requiring user acceptance; they never mutate the graph silently.

## Non-goals for the first release

- Perfect semantic understanding of every language or framework.
- Production observability, live traffic replay, or infrastructure control.
- Automatic source-code refactoring from sandbox changes.
- Precise cloud billing estimates or formal performance guarantees.
- Mandatory real-time collaboration, hosted accounts, or organization administration.
- Replacing threat modeling, load testing, or architecture review by humans.

## Success measures

- A supported project opens with a useful initial graph within 60 seconds on a typical developer laptop.
- Every visible discovered item exposes evidence or an explicit reason why evidence is unavailable.
- A user can create, compare, save, and discard a sandbox without modifying analyzed repositories.
- The complete core workflow passes with network access disabled.
- Remote AI usage is impossible until a user configures a provider and approves the data boundary.
- A new contributor can locate the owner package and test strategy for each core capability from repository documentation.

## Portability

The canonical snapshot is a versioned, JSON-serializable document. Exports include graph data, analyzer versions, workspace-relative evidence references, diagnostics, and optional sandbox operations. They exclude source contents, secrets, absolute home paths, caches, and provider credentials.
