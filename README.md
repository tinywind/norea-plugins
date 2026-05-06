# LNReaderTauri Plugins

Legal-safe sample plugin repository for [LNReaderTauri](https://github.com/tinywind/lnreader-tauri).

This repository starts from the LNReader plugin repository shape, but it intentionally does not import the community source list. Default plugins must either read public-domain/open-license material or user-owned self-hosted libraries.

## Included Samples

| Plugin | Source | Why it is included |
|---|---|---|
| Standard Ebooks | <https://standardebooks.org/> | Standard Ebooks publishes carefully produced public-domain ebooks and provides online reading pages. Users outside the United States still need to verify local copyright status. |
| Komga | User-provided server URL | Komga is self-hosted. Legal status depends on the user's own library, so it is safe as a connector pattern but must not ship sample copyrighted books. |

## Source Policy

- Do not add mirror, aggregator, scan, or scraper sites that republish third-party novels without clear authorization.
- Do not add copyrighted platform content as a default sample, even when the platform itself is legitimate.
- Prefer public-domain, CC0, Creative Commons, official API, or user-owned self-hosted sources.
- Each external source plugin must document why it is safe enough to include and link to the relevant license or terms page.
- Screenshots, README media, fixtures, and demos must use public-domain/open-license content or user-owned test content.

See [docs/source-policy.md](./docs/source-policy.md) before adding a new source.

## Development

```bash
npm install
npm run dev:start
```

Generate the plugin manifest:

```bash
npm run build:full
```

The published manifest is expected at:

```text
https://raw.githubusercontent.com/tinywind/lnreader-tauri-plugins/plugins/v0.1.0/.dist/plugins.min.json
```

## Project Layout

```text
plugins/       Plugin implementations
src/           Local development UI and shared plugin types
scripts/       Manifest and publishing scripts
public/static/ Plugin icons and static assets
docs/          Plugin development and source policy docs
```

## License

Code is MIT, inherited from the upstream LNReader plugin repository structure. External source content keeps its original license and copyright status.
