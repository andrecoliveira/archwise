---
'@archwise/domain': patch
'@archwise/application': patch
'@archwise/analyzers': patch
'@archwise/cli': patch
'@archwise/web': patch
---

The Studio explains every claim. Reason codes read as sentences with their file and line; the inspector has a text-only header, a confidence band ("Observed because:" / "Inferred because:") and Details, Relations and Evidence tabs; summary lines state only claims; relations read by their kind; relations across hidden libraries keep their chain of steps; counters state units and filter; Stripe draws as a payments terminal through the new external-system categories.

Docker Compose evidence now carries line ranges, and the analyzer keeps the image, build context, published ports and `depends_on` of each service as masked properties (ADR 0008). "Show lines" reads at most 40 masked lines of an evidence item through `GET /api/v1/evidence/excerpt/<id>`, keyed by the latest scan and never cached. Because evidence and analyzer versions change, projects with Compose files or external services record a new revision, and a resumed session shows the "architecture changed" notice once.
