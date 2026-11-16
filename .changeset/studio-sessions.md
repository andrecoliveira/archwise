---
'@archwise/web': patch
'@archwise/cli': patch
'@archwise/application': patch
---

The Studio autosaves the Sandbox to the local session store. It adds a Sessions panel (resume, rename, delete, new session), a notice when a resumed session's architecture has since changed, and `archwise --serve --resume latest|SESSION_ID`. Browser `localStorage` is no longer used for Sandbox state.
