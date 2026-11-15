---
'@archwise/application': patch
'@archwise/storage': patch
'@archwise/cli': patch
---

Add the local session store. Discovered graphs are recorded as `archwise.graph` revisions in a SQLite store outside the project. The store has migrations, backups and corruption recovery. The CLI gains a protected session API, `--sessions` and `--no-store`. The Studio session UI follows separately.
