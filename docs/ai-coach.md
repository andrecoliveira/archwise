# Optional AI interviewer and coach

## Modes

- **Interviewer:** behaves like a system-design interviewer, revealing requirements gradually and asking one focused question at a time.
- **Coach:** inspects the selected graph or sandbox, identifies gaps, and offers progressively stronger hints.
- **Reviewer:** produces a structured review against a visible rubric after the user finishes a round.

The user chooses a mode, difficulty, time box, target role level, and graph scope. Sessions are useful without voice; text is the baseline interface.

## Interview loop

1. Establish goals and non-functional requirements.
2. Ask the user to explain current boundaries and data flow.
3. Probe capacity assumptions and rough estimates.
4. Challenge APIs, storage, consistency, scaling, resilience, security, and operations.
5. Tie follow-up questions to graph evidence or explicit unknowns.
6. Invite a sandbox change; never apply it automatically.
7. Summarize strengths, gaps, assumptions, and a next practice objective.

The coach asks before telling. Hints progress from question, to concept, to concrete suggestion. The visible rubric covers requirements, decomposition, data model, interfaces, scalability, reliability, security/privacy, observability, cost, trade-offs, and communication.

## Provider abstraction

The core defines capabilities such as chat, structured output, token estimation, streaming, and local-model support. Adapters may support local OpenAI-compatible endpoints and optional remote providers. Provider packages own SDKs and translate into the core request/response envelope.

Configuration is explicit and scoped per user. Credentials use the OS credential store or environment variables supplied to Archwise; they are never saved in snapshots, logs, exports, browser storage, or repository files.

## Context construction

Context is minimal and user-reviewable. By default it contains selected graph elements, evidence metadata, simulator results, the user's messages, and concise locally generated summaries—not raw source files. Before a remote call, the UI shows provider, data categories, approximate size, and whether any code excerpt is included. Code excerpts require a separate opt-in and redaction pass.

Prompts treat repository text, comments, names, documentation, and model responses as untrusted data. Tool use is allowlisted and read-only. The model cannot access filesystem paths, run commands, call arbitrary URLs, or modify graphs. Suggestions return typed proposal objects validated against schemas and shown for acceptance.

## No-provider experience

Without a provider, Archwise still offers deterministic question packs, rubric checklists, graph completeness prompts, scenario templates, and simulation explanations assembled from local rules. Provider errors degrade to this experience without losing the session.

## Evaluation

An anonymized, synthetic fixture suite evaluates question relevance, evidence citation, hint progression, proposal validity, prompt-injection resistance, and leakage prevention. Live-provider checks are opt-in and excluded from mandatory contributor CI.
