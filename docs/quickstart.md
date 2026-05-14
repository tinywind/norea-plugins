# Quick start

1. [Requirements](#requirements)
2. [Single plugin guide](#guide)
3. [Multi-src guide](#creating-multi-src-plugins)

### Requirements

- [git](https://git-scm.com/doc/ext) basics
- TypeScript or JavaScript basics
- Node >=18
- Dependencies installed with `npm i`
- The canonical [Norea plugin contract](https://github.com/tinywind/norea/blob/main/docs/plugins/contract.md) for supported runtime APIs, sandbox rules, and source plugin data contracts

### Guide

1. Create plugin script in `/plugins` [<span style="font-size: 0.8rem;">(learn more)</span>](#creating-plugin-script)
2. Copy code from [plugin-template.ts](./plugin-template.ts)
3. Start coding [<span style="font-size:0.8rem">(documentation)</span>](./docs.md)

#### Creating plugin script

1. Remember to create your plugin inside the language folder corresponding to the language of the novels
2. File should have the `.ts` extension
   Example `plugins/english/nobleMTL.ts`
3. Add an icon under `public/static/src/<lang>/<plugin-id>/icon.png`
4. Set the plugin's `icon` field to the same path without the `public/static/` prefix

> [!WARNING]
> Icon size should be 96x96px!

Example:

```ts
icon = 'src/english/example/icon.png';
```

### Creating multi-source plugins

Use the `multi` folder for plugins that are language-agnostic, self-hosted, or
catalog sources that are not tied to one novel language.

```text
plugins/multi/example.ts
public/static/src/multi/example/icon.png
```

Multi-source plugins still follow the same `Plugin.PluginBase` contract and
must return `path` fields, not `url` fields.

Every source plugin must implement both `parseNovel()` and
`parseNovelSince(novelPath, sinceChapterNumber)`. Every chapter returned from
`parseNovel()`, `parseNovelSince()`, or `parsePage()` must include a finite,
unique `chapterNumber`. Use the source-provided chapter number when one exists;
otherwise calculate a one-based reading-order number in the plugin.

When a source needs a rendered scraper WebView page rather than a browser fetch,
use `@libs/webView` helpers. The canonical contract defines
`webViewFetch()`, `webViewLoad()`, and `webViewNavigate()`.
