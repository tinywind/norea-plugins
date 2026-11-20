# AGENTS.md

## Plugin source IDs

Use lowercase kebab-case for plugin source IDs. Use hyphens as word separators
instead of spaces, dots, or joined multi-word names.

Keep source IDs stable after release because changing one makes the host treat
the plugin as a different source.

## Plugin publishing

Pushing version branch `0.2` to `origin` (`tinywind/norea-plugins`) validates
and publishes compiled plugin artifacts and manifests to `origin/dist/0.2` via
`.github/workflows/publish-plugins.yml` (which runs
`./scripts/publish-plugins.sh`).

- `.githooks/pre-push` runs local verification only and must not publish
  `dist/*` locally, avoiding race conditions with GitHub Actions.
- Do not disable, bypass, or replace the `dist/<branch>` GitHub Actions publish
  workflow unless the user explicitly asks to change it.
