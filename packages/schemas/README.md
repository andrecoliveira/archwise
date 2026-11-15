# @archwise/schemas

Runtime parsing for untrusted input. Depends inward on `@archwise/domain` and Zod.

- `graphRevisionSchema` and `graphEnvelopeSchema` define the strict Zod structure of `archwise.graph` v1. Unknown fields are rejected at every object boundary.
- `parseGraphEnvelope(input)` checks the format, then dispatches on version (malformed, unsupported older or unsupported future), then parses the structure, then runs domain semantic validation.
- `importGraphJson(text)` enforces the 16 MiB UTF-8 limit before calling `JSON.parse`.
- `serializeGraphRevision(revision)` produces compact canonical JSON. The same logical revision yields identical bytes on every platform.

Issues carry stable codes and structural paths only. They contain no Zod messages, rejected values or unknown key names. The legacy `snapshotEnvelopeSchema` (`{version: 1}`) remains a separate helper and is not a valid graph snapshot.

Public exports live in `src/index.ts`. Tests live in `tests/`. Run `pnpm --filter @archwise/schemas test` from the root. Build dependencies first with `pnpm build`.
