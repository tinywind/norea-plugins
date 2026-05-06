# LNReaderTauri Plugins

Legal-safe sample plugin repository for [LNReaderTauri](https://github.com/tinywind/lnreader-tauri).

This repository starts from the LNReader plugin repository shape, but it intentionally does not import the community source list. Default plugins must either read public-domain/open-license material or user-owned self-hosted libraries.

## Runtime Contract

The canonical plugin runtime, sandbox, whitelist, and host capability contract is maintained in [LNReaderTauri's plugin contract](https://github.com/tinywind/lnreader-tauri/blob/main/docs/plugins/contract.md). Keep this repository focused on sample plugins and source policy; do not duplicate runtime contract details here.

## Included Samples

| Plugin | Source | Evidence | Why it is included |
|---|---|---|---|
| Standard Ebooks | <https://standardebooks.org/> | [Public domain policy](https://standardebooks.org/about/standard-ebooks-and-the-public-domain) | Standard Ebooks publishes carefully produced U.S. public-domain ebooks and dedicates its own ebook work to the public domain. Users outside the United States still need to verify local copyright status. |
| Project Gutenberg | <https://www.gutenberg.org/> | [Terms of use](https://www.gutenberg.org/policy/terms_of_use.html) | Project Gutenberg provides public-domain-in-the-USA ebooks and machine-readable catalogs. This sample uses OPDS/catalog data instead of scraping ebook landing pages. Users outside the United States still need to verify local copyright status. |
| Aozora Bunko | <https://www.aozora.gr.jp/> | [Inclusion policy](https://www.aozora.gr.jp/aozora-manual/) | Aozora Bunko accepts works whose copyright has expired or whose rights holder permits publication. This sample filters the catalog to copyright-expired works only. |
| OAPEN Library | <https://library.oapen.org/> | [REST API guide](https://www.oapen.org/article/8185269-search-using-a-rest-api) | OAPEN provides peer-reviewed open access books and an official REST API with metadata and bitstream links. Individual book licenses still need attribution. |
| Komga | User-provided server URL | [Komga API documentation](https://komga.org/docs/openapi/komga-api) | Komga is self-hosted. Legal status depends on the user's own library, so it is safe as a connector pattern but must not ship sample copyrighted books. See [docs/komga-plugin.md](./docs/komga-plugin.md) for current host requirements. |

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
