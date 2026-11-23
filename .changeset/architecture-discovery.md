---
'@archwise/domain': patch
'@archwise/application': patch
'@archwise/analyzers': patch
'@archwise/discovery': patch
'@archwise/test-fixtures': patch
'@archwise/cli': patch
'@archwise/web': patch
---

Discover architecture, not only packages. Built-in analyzers recognize frontends and services from their frameworks, datastores, queues and external services from client libraries, workspace membership, Docker Compose services and Prisma datasources. Every item carries evidence and is marked `observed` or `inferred`. The Studio opens on a System view and lists inputs it did not analyze.

`--graph` now prints view graph version 2. Projects where the analyzers find something record a new revision, so a resumed session shows the "architecture changed" notice once, and older Sandbox JSON exports of those projects stop matching. Stored Phase 3 views are upgraded on read. A revision with a `frontend` node does not import into an older Archwise.
