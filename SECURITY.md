# Security Policy

## Supported Versions

Security fixes are applied to the active `0.2` source branch and republished to
the `dist/0.2` plugin artifact branch.

| Version / Channel | Supported |
| --- | --- |
| `0.2` (latest `0.2` branch / `dist/0.2` manifest) | Yes |
| Older `0.2` commits or snapshots | No — update to the latest `0.2` build first |
| `< 0.2` (`0.1` plugins) | No |

## Reporting a Vulnerability

Please report suspected security vulnerabilities privately through GitHub
Private Vulnerability Reporting:

- https://github.com/tinywind/norea-plugins/security/advisories/new

Do **not** open a public GitHub issue, pull request, or discussion for an
undisclosed vulnerability.

When submitting a report, include as much of the following as you can:

- Repository commit SHA or plugin source ID and version.
- Affected component (for example: a specific sample plugin under `plugins/`,
  EPUB export sanitization in `src/`, shared plugin libraries, manifest or
  artifact build/verification scripts under `scripts/`, or the local
  development playground/proxy).
- Minimal reproduction steps or proof of concept.
- Expected security impact.

**Do not attach real secrets** such as GitHub tokens used with the
`GitHub Docs` connector, self-hosted Komga credentials, or source site cookies
and sessions.

## Scope

### In scope

Issues in Norea Plugins (`tinywind/norea-plugins`), including:

- Sample source plugins under `plugins/` (unsafe HTML or URL handling,
  credential exposure in connectors such as `Komga` or `GitHub Docs`, or
  violations of the
  [Norea plugin contract](https://github.com/tinywind/norea/blob/0.2/docs/plugins/contract.md)).
- Shared plugin helpers and browser-side EPUB export sanitization (DOMPurify
  filtering, XHTML serialization, attachment handling, and UUID generation).
- Build, manifest generation, artifact verification, and publishing workflows
  under `scripts/` and `.github/workflows/`.
- Dependency vulnerabilities affecting shipped plugin artifacts or the
  supported development toolchain.

### Reported elsewhere

- **Norea client application** (plugin runtime sandbox, WebView isolation, host
  IPC, reader sanitization, VPN routing, local/SAF storage): report in
  [tinywind/norea](https://github.com/tinywind/norea/security).
- **Norea Content Server** (server API, admin console, plugin repository index
  handling): report in
  [tinywind/norea-content-server](https://github.com/tinywind/norea-content-server/security).
- **Third-party plugin repositories**: report directly to the maintainer of the
  repository that publishes the plugin.

### Out of scope

- Vulnerabilities in third-party reading websites or external APIs consumed by
  sample plugins.
- Exposing the local-only development server, proxy, or `Dev Content Type
  Fixture` plugin to untrusted networks.
- Untrusted build checkouts or attacker-writable local build directories.
- Automated scanner findings without a demonstrated impact (see
  [SECURITY_CHECKS.md](https://github.com/tinywind/norea-plugins/blob/0.2/SECURITY_CHECKS.md)
  for documented EPUB checks, manifest builder bounds, and toolchain
  constraints).

## Response and Disclosure

Norea Plugins is maintained on a best-effort basis:

- **Acknowledgement**: we aim to respond within 7 days in the private advisory
  thread.
- **Remediation**: confirmed vulnerabilities are prioritized by severity and
  fixed on the `0.2` branch, followed by updated `dist/0.2` artifacts.
- **Disclosure**: please allow reasonable time for a fix and updated manifest
  before public disclosure. Once resolved, a GitHub Security Advisory may be
  published, with credit if you would like to be acknowledged.

## Security Maintenance

Repository-specific EPUB security checks, manifest builder boundaries, and
toolchain notes are maintained in
[SECURITY_CHECKS.md](https://github.com/tinywind/norea-plugins/blob/0.2/SECURITY_CHECKS.md).
