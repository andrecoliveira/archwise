# Real graph and sandbox

## Canonical graph

The graph is a projection of normalized evidence, not a drawing file. A revision contains:

- nodes with stable IDs, kind, label, attributes, repository ownership, confidence, and evidence references;
- directed edges with type, endpoints, attributes, confidence, and evidence references;
- diagnostics, analyzer coverage, creation time, parent revision, and schema version;
- named views that select and aggregate the same underlying graph.

Initial node kinds include system, repository, service, module, API, job, queue/topic, datastore, external system, and deployment unit. Initial edge kinds include contains, depends-on, calls, publishes, consumes, reads, writes, deploys-to, and exposes.

## Real versus proposed

The **real graph** is an immutable discovered revision. It can change only through a new scan or explicit user attestation captured as separate evidence. The **sandbox** is an ordered overlay based on one real revision.

Sandbox operations are explicit commands:

- add, remove, or replace a proposed node;
- add, remove, or replace a proposed edge;
- override an attribute or assumption;
- group or split a proposed boundary;
- annotate a decision, question, or risk.

Applying an overlay computes a derived graph in memory; it never mutates the base revision. Every visual element is styled by origin: discovered, inferred, user-confirmed, proposed, or removed. A sandbox cannot be mistaken for current reality in exports or screenshots: headers and metadata retain its base revision and status.

## Rebase and conflicts

When discovery creates a newer real revision, a sandbox becomes stale but remains usable. Rebase maps operations by stable IDs and evidence fingerprints. Conflicts occur when a referenced item disappeared, changed kind, or has competing attribute changes. The UI requires resolution by keep proposal, accept reality, retarget, or discard operation; no silent choice is allowed.

## Comparison

Comparison produces a structural diff and metric delta:

- added, removed, and changed elements;
- changed dependencies and boundary crossings;
- new single points of failure or cycles;
- estimated latency, throughput, resilience, complexity, and cost deltas;
- assumptions that materially influence results;
- unanswered questions and coach findings.

## Persistence and export

Sandboxes are saved locally as versioned operation logs. Portable exports reference workspace-relative identifiers and can optionally include the base graph snapshot. They omit source contents and machine paths. Import validates schema, size, operation targets, and checksums before storing anything.
