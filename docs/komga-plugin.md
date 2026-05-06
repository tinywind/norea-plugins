# Komga plugin

Komga is a self-hosted connector. The plugin does not ship a sample server URL
or sample library content.

## Required app inputs

The plugin declares these values through `pluginInputs` and reads them through
`@libs/pluginInputs` at request time. It falls back to `@libs/storage` so older
local settings remain usable.

| Key | Required | Description |
| --- | --- | --- |
| `url` | yes | Base URL of the user's Komga server, for example `https://komga.example.com/` or `http://192.168.1.10:25600/`. |
| `email` | no | Komga account email or username for Basic authentication. |
| `password` | no | Komga account password for Basic authentication. |

The `url` value is normalized by the plugin. If the scheme is omitted, the
plugin assumes `http://`.

## Norea settings

Norea renders plugin settings for installed plugins. Open the Komga
settings action and save the `url`, `email`, and `password` values before
browsing or searching the source.

The password input is masked in the app UI, but the current host input storage
is local app storage rather than an OS keychain.

When the URL is missing, Komga returns empty browse/search results instead of
building invalid URLs.

## Host requirements

The canonical app-side contract is maintained in Norea:

<https://github.com/tinywind/norea/blob/main/docs/plugins/contract.md#app-managed-plugin-inputs>

A compatible host must persist the input keys above for the `komga` plugin
before calling `popularNovels`, `searchNovels`, `parseNovel`, or `parseChapter`.

Komga API authentication supports Basic authentication and API-key based flows.
This sample currently implements Basic authentication only.
