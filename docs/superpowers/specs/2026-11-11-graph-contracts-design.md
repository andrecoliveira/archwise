# Graph contracts: first Phase 2 slice

Status: delivery split approved; detailed specification awaiting owner review.

## Outcome and scope

Deliver a validated, immutable, portable graph revision using synthetic evidence. This is a library slice, not discovery, a browser feature, or completion of Phase 2. SQLite follows in a separate design and implementation PR. Governance and branch-protection prerequisites remain open; this document does not waive the roadmap exit gates.

The owner approved contracts first, then persistence. Implementing both together would mix domain invariants and database concerns in a larger review. A database-first model would couple the public format to storage. Neither alternative is selected.

## Package responsibilities

- `domain`: readonly graph vocabulary and pure semantic validation, with no runtime dependencies, filesystem, clock, randomness, or database access.
- `schemas`: strict Zod parsing of unknown input, version dispatch, bounded JSON import, and deterministic serialization. It depends inward on domain and calls the same semantic validator.
- `application`: orchestration only when a use case requires it; no speculative storage or provider interfaces in this slice.
- `test-fixtures`: synthetic examples, never copied user source or credentials.

Use focused modules for identifiers, evidence, graph records, validation, revision construction, and serialization. Public exports are the only supported package entry points. Schema/type compatibility tests prevent divergence between domain types and runtime parsers.

## Revision v1

The envelope has `format: "archwise.graph"`, `version: 1`, and one `revision`. The revision contains an opaque ID, workspace ID, nullable parent revision ID, UTC creation timestamp, `complete` or `partial` coverage status, repositories, analyzer coverage, evidence, nodes, edges, and diagnostics. Unknown fields are rejected at every object boundary.

IDs are nonempty ASCII tokens matching `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}`. Callers supply IDs and timestamps; constructing a revision has no ambient side effects. IDs are unique within their record collection; references are typed by target collection. A parent cannot equal the current revision. Checking whether a parent exists in history belongs to the later storage use case.

Repository records contain only an ID and display label. Absolute root locations are local runtime configuration and never part of the portable revision.

Nodes contain ID, kind, label, nullable repository ID, confidence, and evidence IDs. Initial kinds are system, repository, service, module, api, job, queue, topic, datastore, external-system, and deployment-unit. Edges contain ID, kind, source and target node IDs, confidence, and evidence IDs. Edge kinds are contains, depends-on, calls, publishes, consumes, reads, writes, deploys-to, and exposes. Source and target must exist. Dependency cycles and self-calls are representable; containment must be acyclic and cannot contain itself.

Arbitrary attributes, UI coordinates, source excerpts, URLs, environment values, and free-form metadata bags are excluded from this first contract. Adding such fields requires explicit schema and security review.

## Evidence, confidence, and diagnostics

Evidence records contain ID, repository ID, analyzer ID/version, rule ID, normalized repository-relative path, and an optional positive inclusive line range. End line cannot precede start line. Paths use `/`; reject absolute paths, backslashes, drive prefixes, empty segments, `.` and `..`, NUL and control characters. Reject rather than silently repair imported paths. Filesystem existence and symlink checks belong to discovery, not this library.

Each node and edge has at least one existing evidence reference. Confidence uses `observed`, `inferred`, or `unknown`, with a nonempty list of machine-readable reason codes. Confidence is not an unexplained numerical probability. Unknown confidence still refers to evidence explaining the uncertainty. User attestations and proposed entities are not silently promoted into discovered evidence.

Analyzer coverage records identify analyzer/version, repository, and status (`complete`, `partial`, `failed`, or `unsupported`). A revision marked complete cannot contain partial or failed coverage. Complete means declared analyzer work finished, not that every architecture fact is known.

Diagnostics contain ID, severity (`info`, `warning`, `error`), stable code, and optional typed references to repository, node, edge, or evidence. All supplied references must exist. Raw exception messages and repository-derived diagnostic text are excluded. Human explanations come from code-owned message catalogs outside portable data.

## Construction and failures

Unknown input passes through structural parsing before semantic validation. Validation returns a discriminated success/failure result with stable error codes and structural field locations; it never echoes rejected values. Version errors distinguish malformed, unsupported older, and unsupported future versions. There are no released older graph formats to migrate in this slice. The existing `{version: 1}` foundation envelope remains a separate legacy helper, not a valid graph snapshot.

Construction copies caller-owned collections, validates the whole candidate, and recursively freezes the accepted revision. Mutating the input later cannot change the revision. No partially accepted revision is returned when validation fails. Valid partial scan coverage is distinct from malformed input.

## Deterministic portability and limits

The JSON importer accepts text up to 16 MiB measured as UTF-8 before parsing. Limit each record collection to 10,000 entries, each evidence-reference list to 1,000 IDs, display labels to 256 characters, and paths to 1,024 characters. The fixed schema has no recursively nested user data. These are initial safety ceilings, not performance promises; benchmark before increasing them.

Canonical serialization uses explicit object field order, sorts record collections by ID, coverage by repository/analyzer/version, and set-like reference/reason lists by ASCII code-unit order. Reject duplicate coverage keys and duplicate reference/reason entries. Do not use locale-sensitive sorting. Emit compact JSON without a trailing newline; preserve Unicode label spelling. Same logical revision, IDs, timestamp and schema version must produce identical UTF-8 bytes regardless of input collection order or OS.

Serialization validates again and includes only declared portable fields. Labels and paths remain untrusted strings: reject control characters and known secret-value patterns before export, and test synthetic credential examples. This is defense in depth, not proof that arbitrary labels contain no sensitive information. A later user-facing export flow must offer review; documentation must not claim perfect secret detection. No source content or absolute-root field is accepted by the format.

## Sandbox boundary

Define only a readonly sandbox reference containing sandbox ID, schema version, workspace ID and base revision ID. Binding it to a supplied revision validates matching workspace/base IDs. It does not contain graph mutations or imply that proposed edits are observed facts. Operation logs, materialization, undo/redo, rebase and UI remain Phase 7 work.

## Verification and acceptance

Tests must cover valid empty and nonempty revisions; each node/edge kind; duplicate IDs; dangling references; missing evidence; invalid confidence; containment cycles; permitted dependency cycles; invalid dates and line ranges; malformed and future versions; strict unknown-field rejection; import size limits; unsafe POSIX/Windows paths; synthetic credentials; input mutation; deep freezing; and sandbox/base mismatches.

Use deterministic permutations to verify ordering invariance and JSON round trips. Compare one golden serialized fixture across the existing Linux/macOS/Windows and Node 24/26 CI matrix. Assert error payloads do not contain rejected secret values. Run package tests, type checks, architecture-boundary tests and the complete `pnpm check` before publication. Changes remain on a feature branch with signed-off commits and a focused PR.

## Following persistence slice

The separate SQLite design must cover an application-owned repository interface, in-memory contract-test adapter, SQLite adapter, OS application-data placement outside analyzed roots, atomic revision writes, transactional migrations, backup and corruption recovery, and safe concurrent access. It must use the portable contract without introducing database dependencies into domain. No SQLite driver or database format is selected by this document.
