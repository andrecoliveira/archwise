# Automatic discovery and multi-repository workspaces

## Entry points

- `archwise`: analyze the current working directory.
- `archwise --path <directory>`: analyze an explicit root.
- `archwise --repo <directory> --repo <directory>`: compose multiple roots.
- `archwise --workspace <file>`: load a reviewed workspace manifest with repositories, labels, and optional relations.

Paths are canonicalized once, deduplicated, checked for readability, and assigned stable workspace-relative identifiers. Symlinks are not followed outside declared roots by default.

## Repository detection

The resolver searches from each input root for VCS boundaries and ecosystem/workspace manifests, including `package.json`, npm/pnpm/yarn workspaces, Turborepo/Nx configuration, Maven/Gradle, Go workspaces/modules, Cargo, Python project files, Docker Compose, Kubernetes manifests, Terraform, and CI definitions. Support is analyzer-based and incremental; unsupported ecosystems produce coverage diagnostics rather than invented relationships.

Nested repositories are separate roots unless explicitly absorbed. Generated directories, dependencies, build outputs, VCS internals, large binaries, and user ignore rules are excluded. The inventory has configurable file-count, depth, and byte limits with visible truncation diagnostics.

## Static analysis stages

1. **Inventory:** paths, types, sizes, hashes, and manifest candidates.
2. **Manifest parsing:** packages, scripts as text, dependencies, workspace membership, deployment declarations.
3. **Syntax analysis:** imports, exports, endpoints, events, database clients, and framework conventions through safe parsers.
4. **Infrastructure analysis:** containers, services, networks, queues, stores, public entry points, and deployment targets.
5. **Resolution:** map normalized facts across repositories and mark ambiguous or unresolved relations.
6. **Graph build:** aggregate facts into architectural views without discarding underlying evidence.

No stage runs package-manager scripts, imports application modules, starts containers, evaluates templates, or loads repository `.env` files.

## Cross-repository resolution

Relations use declared identifiers first: package coordinates, service names, image names, API schemas, event topics, Terraform outputs, and workspace-manifest hints. Heuristics may correlate endpoints or names only when labeled inferred and assigned lower confidence. Unresolved candidates remain visible so users can confirm or reject them in local metadata.

Repository-specific configuration lives in the Archwise application store by default. A shareable `archwise.workspace.json` may be exported deliberately, but Archwise never creates it inside a repository during inspection.

## Incremental rescans

File hashes and analyzer versions form the cache key. A watcher batches filesystem events, re-runs only affected analyzers, and creates a new graph revision atomically. Git branch changes or large event bursts trigger a consistency rescan. Users can pause watching, request a clean scan, and inspect why an item changed.

## Evidence and confidence

Evidence references contain repository ID, relative path, line/column range when available, analyzer/version, extraction rule, and content hash. Confidence uses explainable categories (`confirmed`, `high`, `medium`, `low`) rather than opaque decimals alone. User confirmations are separate attestations and never rewrite original evidence.
