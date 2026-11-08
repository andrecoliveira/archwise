# ADR 0002: Apache-2.0 and DCO

- Status: Accepted
- Date: 2026-11-08

## Context

Archwise needs clear reuse terms and a lightweight contribution process for future collaborators. The owner explicitly approved Apache-2.0 and DCO after reviewing their purposes.

## Decision

License the project under the canonical Apache License 2.0 in the root `LICENSE`. Require DCO 1.1 certification through a `Signed-off-by` trailer on new contribution commits. Do not introduce a CLA or rewrite historical commits to certify them retroactively.

## Consequences

Reuse and distribution follow Apache-2.0, including its notice obligations. Contributors retain their copyright. DCO certifies contribution origin; it does not transfer ownership or constitute a cryptographic signature. Maintainers initially review trailers manually. Automated enforcement is separate work.

Repository visibility, private vulnerability reporting, and community enforcement channels are separate decisions. This ADR does not authorize making the repository public or imply those channels are configured.
