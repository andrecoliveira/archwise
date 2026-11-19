# @archwise/discovery

Filesystem adapter for the application `WorkspaceInventory` port. It inspects analyzed projects as data: it never executes, imports or writes anything inside a scanned root.

- `walker.ts`: the budgeted, read-only listing with skip reasons and nested repositories.
- `gitignore.ts`: an in-repo gitignore matcher.
- `manifest.ts`: `package.json` parsing with binary detection, hashing and redaction.
- `filesystem-inventory.ts`: the `WorkspaceInventory` adapter.
