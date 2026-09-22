# Norea Plugins

Legal-safe sample plugin repository for [Norea](https://github.com/tinywind/norea).

This repository starts from the upstream plugin repository shape, but it intentionally does not import the community source list. Default plugins must either read public-domain/open-license material or user-owned self-hosted libraries.

## Runtime Contract

The canonical plugin runtime, sandbox, whitelist, and host capability contract is maintained in [Norea's plugin contract](https://github.com/tinywind/norea/blob/main/docs/plugins/contract.md). Keep this repository focused on sample plugins and source policy; mirror only the author-facing requirements needed to keep samples compatible.

Current source plugins must declare `apiVersion = '0.2' as const`, provide
`getChapterAcquisitionPlan()`, `parseNovel()`, and
`parseNovelSince(novelPath, sinceChapterNumber)`, and return `chapterNumber` on
every chapter. Resource plans also require `getChapterResource()`.
`parseNovel()` returns full metadata and the full chapter list.
`parseNovelSince()` returns the same metadata fields but may return only
chapters whose `chapterNumber` is greater than or equal to
`sinceChapterNumber`; plugins that cannot optimize may return the full chapter
list. Chapter numbers are plugin-owned stable ordering keys, must be numeric,
must be unique within a novel, and must be sorted in reading order.

The optional `resolveUrl(path, isNovel?)` maps a source path to an absolute URL.
It must preserve already absolute URLs. `isNovel` distinguishes novel links
from chapter links when a source uses different path prefixes. The host falls
back to the plugin base URL when this method is absent.

## Included Samples

| Plugin | Primary content | Reader format | Source | Evidence | Why it is included |
|---|---|---|---|---|---|
| Standard Ebooks | Public-domain prose ebooks | Chaptered HTML | <https://standardebooks.org/> | [Public domain policy](https://standardebooks.org/about/standard-ebooks-and-the-public-domain) | Standard Ebooks publishes carefully produced U.S. public-domain ebooks and dedicates its own ebook work to the public domain. Users outside the United States still need to verify local copyright status. |
| Project Gutenberg | Public-domain prose ebooks | Single full-book HTML chapter | <https://www.gutenberg.org/> | [Terms of use](https://www.gutenberg.org/policy/terms_of_use.html) | Project Gutenberg provides public-domain-in-the-USA ebooks and machine-readable catalogs. This sample uses OPDS/catalog data instead of scraping ebook landing pages. Users outside the United States still need to verify local copyright status. |
| Aozora Bunko | Japanese literature | HTML or plain text | <https://www.aozora.gr.jp/> | [Inclusion policy](https://www.aozora.gr.jp/aozora-manual/) | Aozora Bunko accepts works whose copyright has expired or whose rights holder permits publication. This sample filters the catalog to copyright-expired works only. |
| NDL Public Domain Manga | Public-domain manga | Vertical scanned-page image scroll (IIIF JPEG) | <https://lab.ndl.go.jp/dl/> | [Next Digital Library terms](https://lab.ndl.go.jp/service/tsugidigi/tsugidigi_en/) and [API documentation](https://lab.ndl.go.jp/service/tsugidigi/apiinfo/) | The Next Digital Library contains copyright-expired materials marked with the Public Domain Mark. This deliberately narrow sample accepts NDC `726.1*` records, or legacy broad `726` records whose title explicitly identifies them as manga, and requires a `PDM` IIIF manifest before reading. It preserves NDL attribution and discloses that page images are scaled to 1600 pixels wide through the NDL IIIF API. The API is freely available without application except for continuous commercial use; contact NDL for that use. |
| OAPEN Library | Open-access academic books | PDF, EPUB, plain text, or HTML link | <https://library.oapen.org/> | [REST API guide](https://www.oapen.org/article/8185269-search-using-a-rest-api) | OAPEN provides peer-reviewed open access books and an official REST API with metadata and bitstream links. Individual book licenses still need attribution. |
| Pepper&Carrot | Webtoon | Vertical image scroll (low-resolution JPEG pages) | <https://www.peppercarrot.com/> | [License and attribution guidance](https://www.peppercarrot.com/en/documentation/120_License_best_practices.html) and [official API documentation](https://www.peppercarrot.com/en/documentation/130_API.html) | Pepper&Carrot is an official CC BY 4.0 webcomic. This sample reads the official episode index and unmodified low-resolution pages, credits David Revoy, and keeps each episode's contributor and translation credit page. |
| Komga | User-owned comics and books | One image or HTML page per chapter | User-provided server URL | [Komga API documentation](https://komga.org/docs/openapi/komga-api) | Komga is self-hosted. Legal status depends on the user's own library, so it is safe as a connector pattern but must not ship sample copyrighted books. See [docs/komga-plugin.md](./docs/komga-plugin.md) for current host requirements. |
| GitHub Docs | User-owned documentation | Rendered Markdown/HTML, plain text, PDF, or EPUB | User-provided repository | [GitHub REST API documentation](https://docs.github.com/en/rest) | GitHub Docs is a connector for user-owned repositories. One installed source instance represents one configured work folder and does not ship sample copyrighted content. |
| Dev Content Type Fixture | Development fixtures | HTML, plain text, and PDF | Local dev server static files | Local fixture content | Development-only smoke fixture for Norea's per-chapter `html`, `text`, and `pdf` content types. It does not contact external sites. |

## GitHub Docs Source

`GitHub Docs` is a `multiSource` plugin. The catalog entry is installed through
Norea's `Add GitHub source` flow, and each installed source instance maps one
GitHub repository folder to one Norea work.

GitHub REST API requests use `@libs/fetch.appFetch`, the Norea host's
app-native HTTP path. Ordinary website plugins should keep using `fetchApi` so
their traffic stays on the scraper WebView session path.

Required fields:

| Field | Meaning |
| --- | --- |
| Work title | The Norea work title shown in the source catalog and novel view. |
| Repository | GitHub repository in `owner/repo` form. |
| Ref | Optional branch, tag, or commit. If omitted, GitHub's default branch is used. |
| Work folder | Repository path that acts as the chapter root. URL-encoded path segments are accepted and decoded before GitHub tree matching. |
| Chapter files | Comma- or newline-separated glob/regexp patterns matched against both the file name and the work-folder-relative chapter path. |
| Exclude files | Optional comma- or newline-separated glob/regexp patterns matched after `Chapter files`. |
| GitHub token | Optional for public repositories and required for private repositories. GitHub returns `404` for private repositories when the token is missing or lacks access. |

The chapter name returned to Norea is the path relative to `Work folder`. For a
file at:

```text
works/my-novel/manuscripts/arc-001/ch-001.md
```

with `Work folder` set to:

```text
works/my-novel/manuscripts
```

the chapter name is:

```text
arc-001/ch-001.md
```

Use `regex:` for exact path requirements. This includes `arc-001/ch-001.md` but
excludes `arc-001-legacy/ch-001.md`:

```text
regex:^arc-[0-9]{3}/ch-[0-9]+\.md$
```

Use `glob:` when a pattern contains regexp-looking characters but must be
handled as a glob.

## Source Policy

- Do not add mirror, aggregator, scan, or scraper sites that republish third-party novels without clear authorization.
- Do not add copyrighted platform content as a default sample, even when the platform itself is legitimate.
- Prefer public-domain, CC0, Creative Commons, official API, or user-owned self-hosted sources.
- Each external source plugin must document why it is safe enough to include and link to the relevant license or terms page.
- Screenshots, README media, fixtures, and demos must use public-domain/open-license content or user-owned test content.

See [docs/source-policy.md](./docs/source-policy.md) before adding a new source.

## Development

### Environment

Use the same Node.js major version as CI:

| Tool | Version | Required for |
| --- | --- | --- |
| Node.js | 24.x | Development server, TypeScript compilation, manifest generation, verification hooks |
| npm | Bundled with Node.js 24.x | Dependency installation and project scripts |

```bash
npm install
npm run hooks:install
npm run dev:start
```

The `Dev Content Type Fixture` plugin is available when the local dev server is
running. Use it from the playground or from a local Norea build pointed at this
repository's dev manifest to smoke test three chapter rows: HTML with relative
media references, raw plain text, and a PDF-backed chapter. The fixture is
excluded from the production manifest; `build:manifest:dev`
includes it through an explicit dev-only manifest flag. The static files live
under `public/static/fixtures/content-types/`.

For desktop smoke testing, keep `USER_CONTENT_BASE` and the fixture plugin's
`baseUrl` setting at `http://localhost:3000`. For the Android emulator, set both
values to `http://10.0.2.2:3000` before generating the dev manifest and before
using the installed fixture source in Norea.

After changing plugin source code, regenerate the compiled JavaScript and the
manifest before testing through Norea:

```bash
npm run build:compile
npm run build:manifest:dev
```

Existing installed source instances keep the plugin JavaScript that was stored
when they were installed. Uninstall and reinstall the source instance in Norea
when testing a plugin contract or input-shape change.

Generate the plugin manifest:

```bash
npm run build:full
```

Run the local verification used by the commit hook:

```bash
npm run verify:commit
```

This includes `npm run typecheck` before artifact compilation. Production
compilation uses `noCheck` to emit standalone plugin files, so successful
artifact generation alone does not verify TypeScript call contracts.

After `npm run build:full`, verify the generated manifest and compiled plugin JavaScript:

```bash
npm run verify:plugins
```

The published manifest is expected at:

```text
https://raw.githubusercontent.com/tinywind/norea-plugins/dist/v0.2/.dist/plugins.min.json
```

## Compatibility

The 0.2 plugin contract does not guarantee compatibility with 0.1 plugins or
0.1 hosts.

## Project Layout

```text
plugins/       Plugin implementations
src/           Local development UI and shared plugin types
scripts/       Manifest and publishing scripts
public/static/ Plugin icons and static assets
docs/          Plugin development and source policy docs
```

## License

Code is MIT, inherited from the upstream plugin repository structure. External source content keeps its original license and copyright status.
