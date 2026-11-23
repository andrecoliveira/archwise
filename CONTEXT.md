# Archwise

Archwise turns local code and configuration into an evidence-backed architecture model that people can inspect, question and change in a separate sandbox.

## Language

### Studio

**Explore**:
The Studio mode that shows the discovered architecture, read-only, with its evidence.
_Avoid_: Discover (as a mode name), inspect mode, real view

**Sandbox**:
The Studio mode for hypothetical changes, kept apart from the discovered architecture and never written into analyzed repositories.
_Avoid_: Playground, draft, design mode

**System view**:
The Explore view that shows frontends, services and infrastructure and hides internal libraries. **All packages** is the view that shows every package.
_Avoid_: Simplified view, overview

### Evidence

**Evidence**:
A pointer to where a claim comes from: a file, the rule that read it and, when known, a line range. It points to the file; it is not the file's content.
_Avoid_: Proof, source, citation

**Excerpt**:
The read-only lines an evidence points to, shown on request. Denied files are never excerpted, and secret-looking values are masked.
_Avoid_: Snippet, preview

### Model

**Component**:
A part of the system shown as one node: a frontend, service, module, datastore, queue, external system or job.
_Avoid_: Node, item, element (in user-facing text)

**Alias**:
Another name for a component taken from another source, such as its Compose service name. The primary name is the package name when one exists.
_Avoid_: Nickname, label

**Relation**:
A directed claim between two components. Its wording is its kind (depends on, calls, publishes to, consumes from, reads, writes), never an interpretation.
_Avoid_: Edge, link, connection (in user-facing text)

**Coverage gap**:
A file Archwise saw but did not analyze, always with its reason, such as an unsupported format or invalid syntax. Shown to people as "not analyzed".
_Avoid_: Error, skipped file, warning

**Indirect relation**:
A relation the System view draws across hidden libraries. Its reasons are the chain of steps, and its confidence is that of the weakest step.
_Avoid_: Lifted edge, via-edge

### Annotations

**Note**:
Text a person writes about a component, such as its purpose. It is labeled as theirs and is never evidence.
_Avoid_: Comment, description

**Suggestion**:
Text an AI provider proposes, only after the person consents to send context. It is labeled as a suggestion and is never evidence.
_Avoid_: Insight, recommendation

### Confidence

**Claim**:
Something the architecture model asserts: a component, a relation, or a property of either. Every claim has one confidence level and at least one reason, whatever the level.
_Avoid_: Finding, fact (in user-facing text)

**Observed**:
A claim that a file states directly, such as a Compose image or a declared workspace dependency.
_Avoid_: Confirmed, verified, detected

**Inferred**:
A claim Archwise deduced from other facts, such as a database from a client library. It is always shown with its reasons.
_Avoid_: Deduced, guessed, probable

**Unknown**:
Something Archwise found but could not classify.
_Avoid_: Unrecognized, other

**Confirmation**:
A future user attestation that a claim is true. It is stored apart from the evidence and never rewrites it.
_Avoid_: Approval, verification

**Reason**:
A stable code stating why Archwise holds a claim at its confidence level, such as `client-library:pg`. People read it as a sentence that names the file it comes from; the code stays visible beside it for tracing.
_Avoid_: Justification, explanation
