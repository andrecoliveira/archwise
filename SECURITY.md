# Security policy

## Report privately

Use [Report a vulnerability](https://github.com/andrecoliveira/archwise/security/advisories/new) to submit a private report. GitHub Private Vulnerability Reporting is enabled. Repository visibility remains private; reporting availability also depends on your GitHub access.

Do not post vulnerability details or secrets in issues or pull requests. Include the affected commit or version, a minimal sanitized reproduction, expected impact, and any suggested mitigation. Never attach credentials or private project source. If you cannot access the reporting form, do not disclose the vulnerability publicly; request a private channel from a maintainer through an existing authorized contact.

## Supported versions

No application release exists yet. Maintainers assess reports against the current main branch and active development PRs. A supported-release matrix will be published before the first release.

## Handling reports

Maintainers aim to acknowledge reports within five business days and provide an initial assessment within ten business days. These are project targets, not a contractual SLA. Disclosure timing is coordinated with the reporter after a mitigation is available. Reports and reproductions remain private during assessment.

## Scope

Prioritize repository parsing, local API access, path traversal, source confidentiality, imports/exports, dependency integrity, and optional AI data boundaries. Review the [security design](docs/security.md) for intended controls; specified controls are not evidence of implemented functionality.
