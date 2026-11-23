---
'@archwise/web': patch
'@archwise/cli': patch
---

Studio redesign, foundation: design tokens with dark (default) and light themes, a bundled JetBrains Mono font, a three-column layout with a top bar, Explore and Sandbox tabs (opening in Explore when the project has components), a revision chip with the scan time, Scan notes, and flat component cards. `/api/v1/scan` now includes `scannedAt`, and the local server's CSP allows `font-src 'self'`.
