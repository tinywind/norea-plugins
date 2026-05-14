# Testing website tutorial

Use the local playground to exercise plugin methods before publishing a
manifest.

## Getting started

1. Start the development server:

   ```bash
   npm run dev:start
   ```

2. Open [localhost:3000](http://localhost:3000).

3. Select a plugin from the left sidebar.

## Sections

The playground has five tabs:

| Tab           | Purpose                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Popular       | Calls `popularNovels(pageNo, options)` with pagination, latest/popular mode, and filters when present.                                       |
| Search        | Calls `searchNovels(searchTerm, pageNo)`.                                                                                                    |
| Parse Novel   | Calls `parseNovel(novelPath)` and displays metadata and chapters.                                                                            |
| Parse Chapter | Calls `parseChapter(chapterPath)` for string fallbacks and `parseChapterResource(chapterPath)` for PDF/EPUB binary resources when available. |
| Settings      | Configures playground request behavior such as user agent, cookies, and fetch mode. This is not the app's per-plugin settings UI.            |

Use plugin `path` values in the Parse Novel and Parse Chapter inputs. A `path`
may look like a URL, but it is plugin-owned data and should be copied from the
Popular, Search, or Parse Novel results.

## Pre-submission checks

Before submitting a plugin, verify:

- Popular and latest listings return expected results.
- Search returns expected results and empty searches are handled deliberately.
- Parse Novel returns `name`, `path`, and a chapter list.
- Parse Chapter returns content matching the chapter `contentType`: HTML without source chrome or scripts, raw text for text chapters, or a binary-backed PDF/EPUB resource with a readable fallback.
- Filters work when implemented.
- Cover images load or define `imageRequestInit` when needed.
- No unauthorized copyrighted text, covers, screenshots, or fixtures are added.
- No credentials, cookies, or tokens are logged.

## Need help?

- Plugin API reference: [docs.md](./docs.md)
- Plugin creation: [quickstart.md](./quickstart.md)
- Source policy: [source-policy.md](./source-policy.md)
- Issues: [GitHub issues](https://github.com/tinywind/norea-plugins/issues/new)
