# Documentation for Norea plugins

This document is an authoring companion for sample plugins in this repository.
The canonical runtime, sandbox, module whitelist, and host capability contract
lives in [Norea's plugin contract](https://github.com/tinywind/norea/blob/main/docs/plugins/contract.md).
Keep this repository focused on sample plugins and source policy.

- [PluginBase](#pluginbase)
- [NovelItem](#novelitem)
- [SourceNovel](#sourcenovel)
- [ChapterItem](#chapteritem)
- [Filters](#filters)
- [Plugin Inputs](#plugin-inputs)
- [Using Cheerio](#using-cheerio)
- [Fetching](#fetching)
- [Storage](#storage)

Most plugin domain types are available through the `Plugin` namespace:

```ts
import { Plugin } from '@/types/plugin';
```

Filters are imported separately:

```ts
import { FilterTypes, Filters } from '@libs/filterInputs';
```

## PluginBase

Every plugin exports one instance that implements `Plugin.PluginBase`.

```ts
class ExamplePlugin implements Plugin.PluginBase {
  id = 'example';
  name = 'Example';
  icon = 'siteNotAvailable.png';
  site = 'https://example.com/';
  version = '1.0.0';

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    return { name: 'Untitled', path: novelPath, chapters: [] };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    return '';
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    return [];
  }
}

export default new ExamplePlugin();
```

| Field | Required | Description |
| --- | --- | --- |
| `id` | yes | Stable plugin id. Must match the repository manifest entry. |
| `name` | yes | Display name shown in the app. |
| `icon` | yes | Path under `public/static`, without the `public/static/` prefix. |
| `site` | yes | Canonical source URL used by the host for display and fetch context. |
| `version` | yes | Semver-style plugin version. |
| `imageRequestInit` | no | Extra request init for cover image requests. |
| `filters` | no | Filter schema used by `popularNovels`. |
| `pluginInputs` | no | App-managed input schema for sources that need user-provided values. |
| `pluginSettings` | no | Compatibility alias for hosts that support upstream-style plugin settings. |
| `popularNovels(pageNo, options)` | yes | Returns a page of source items. |
| `parseNovel(novelPath)` | yes | Returns metadata and chapter list for one source item. |
| `parseChapter(chapterPath)` | yes | Returns HTML content for one chapter. |
| `searchNovels(searchTerm, pageNo)` | yes | Returns a page of search results. |
| `resolveUrl(path, isNovel?)` | no | Converts opaque plugin paths into browser URLs. |
| `parsePage(novelPath, page)` | page plugins only | Returns additional chapter pages for paginated sources. |

### `id`

Use lowercase, stable ids. Changing an id makes the host treat the plugin as a
different source.

```ts
id = 'standardebooks';
```

### `name`

Use the source or connector name shown to users.

```ts
name = 'Standard Ebooks';
```

### `icon`

Store icons under `public/static`. The `icon` field is relative to that
directory and must not include `public/static/`.

```ts
icon = 'src/multi/komga/icon.png';
```

Use 96x96 px PNG icons where possible. If no icon is available, use:

```ts
icon = 'siteNotAvailable.png';
```

### `site`

For public sources, use the real source origin.

```ts
site = 'https://standardebooks.org/';
```

For self-hosted connectors, use a stable product or documentation URL in the
manifest, and read the user's server URL from settings or storage at request
time. Do not put placeholder values such as `url` in `site`; the app may use
`site` as a fetch context.

### `version`

Use `<major>.<minor>.<patch>`.

- Increment `patch` for small fixes such as selector, URL, or filter value fixes.
- Increment `minor` for compatible capability changes such as new filters.
- Increment `major` for incompatible path or behavior changes.

### `imageRequestInit`

Use this only when covers require extra headers.

```ts
imageRequestInit: Plugin.ImageRequestInit = {
  headers: {
    Referer: 'https://example.com/',
  },
};
```

### `popularNovels`

Return source items for the requested one-based page number. `showLatestNovels`
is true when the host requests the latest listing. `filters` contains resolved
filter values when the plugin defines filters.

```ts
async popularNovels(
  pageNo: number,
  options: Plugin.PopularNovelsOptions<typeof this.filters>,
): Promise<Plugin.NovelItem[]> {
  const mode = options.showLatestNovels ? 'latest' : 'popular';
  const order = options.filters?.order.value || mode;

  return [
    {
      name: `Example ${order}`,
      path: `books/example-${pageNo}`,
      cover: 'https://example.com/cover.jpg',
    },
  ];
}
```

### `parseNovel`

`parseNovel` receives the `NovelItem.path` returned by `popularNovels` or
`searchNovels`. It must return the same `path` value on the `SourceNovel`.

```ts
async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
  return {
    name: 'Example Book',
    path: novelPath,
    author: 'Example Author',
    cover: 'https://example.com/cover.jpg',
    genres: 'Fantasy, Adventure',
    status: 'Completed',
    summary: 'Short source summary.',
    chapters: [
      {
        name: 'Chapter 1',
        path: `${novelPath}/chapter-1`,
        chapterNumber: 1,
      },
    ],
  };
}
```

### `parseChapter`

`parseChapter` receives a `ChapterItem.path` and returns chapter HTML.

```ts
async parseChapter(chapterPath: string): Promise<string> {
  const response = await fetchApi(new URL(chapterPath, this.site).href);
  const html = await response.text();
  const $ = parseHTML(html);
  return $('main').html() || '';
}
```

### `searchNovels`

Return source items for the requested search term and one-based page number.
Return an empty array when there are no results or when the connector is not
configured enough to search.

```ts
async searchNovels(
  searchTerm: string,
  pageNo: number,
): Promise<Plugin.NovelItem[]> {
  if (!searchTerm.trim()) return this.popularNovels(pageNo, {
    showLatestNovels: false,
    filters: {} as never,
  });

  return [];
}
```

## NovelItem

`NovelItem` is the lightweight result shown in source listings and search.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Title shown in listings. |
| `path` | `string` | yes | Opaque plugin-owned identifier. |
| `cover` | `string` | no | Cover URL. Relative URLs should be resolvable by the host or normalized by the plugin. |

`path` does not have to be a browser URL. It can be a relative path, an API id,
or an encoded payload as long as the same plugin can handle it later.

## SourceNovel

`SourceNovel` extends `NovelItem` with metadata and chapters.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Novel title. |
| `path` | `string` | yes | Same opaque path passed to `parseNovel`. |
| `cover` | `string` | no | Cover URL. |
| `genres` | `string` | no | Comma-separated genre list. |
| `summary` | `string` | no | Plain text or simple HTML summary. |
| `author` | `string` | no | Author names. |
| `artist` | `string` | no | Artist names. |
| `status` | `string` | no | Reading/publication status. Prefer values from `NovelStatus` when possible. |
| `rating` | `number` | no | Rating out of 5. |
| `chapters` | `ChapterItem[]` | no | Chapter list. Use an empty array when known empty. |

## ChapterItem

`ChapterItem` is the lightweight chapter row stored by the host.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | `string` | yes | Chapter label shown in the reader. |
| `path` | `string` | yes | Opaque plugin-owned chapter identifier. |
| `releaseTime` | `string` or `null` | no | ISO date, `YYYY-MM-DD`, or source-provided date string. |
| `chapterNumber` | `number` | no | Numeric chapter value when the source exposes one. |
| `page` | `string` | no | Pagination cursor for page-based plugins. |

## Filters

Filters define controls shown for `popularNovels`. The host passes selected
values back as `{ type, value }` pairs in `options.filters`.

```ts
filters = {
  order: {
    label: 'Order',
    type: FilterTypes.Picker,
    value: 'popular',
    options: [
      { label: 'Popular', value: 'popular' },
      { label: 'Newest', value: 'newest' },
    ],
  },
  completedOnly: {
    label: 'Completed only',
    type: FilterTypes.Switch,
    value: false,
  },
} satisfies Filters;
```

| FilterTypes member | Runtime value | `value` type | Requires `options` |
| --- | --- | --- | --- |
| `Picker` | `Picker` | `string` | yes |
| `TextInput` | `Text` | `string` | no |
| `Switch` | `Switch` | `boolean` | no |
| `CheckboxGroup` | `Checkbox` | `string[]` | yes |
| `ExcludableCheckboxGroup` | `XCheckbox` | `{ include?: string[]; exclude?: string[] }` | yes |

Use `include` and `exclude` property names for excludable checkbox values.

```ts
filters = {
  genres: {
    label: 'Genres',
    type: FilterTypes.ExcludableCheckboxGroup,
    value: { include: [], exclude: [] },
    options: [
      { label: 'Fantasy', value: 'fantasy' },
      { label: 'Romance', value: 'romance' },
    ],
  },
} satisfies Filters;
```

## Plugin Inputs

Norea owns the canonical input contract:

<https://github.com/tinywind/norea/blob/main/docs/plugins/contract.md#app-managed-plugin-inputs>

Use `pluginInputs` for user-provided values such as a self-hosted server URL,
username, password, token, or feature toggle. Keep `pluginSettings` as an alias
only when older hosts need it, and make plugin methods tolerate missing values.

```ts
pluginInputs = {
  url: {
    value: '',
    label: 'Server URL',
    type: 'Url',
    required: true,
  },
  hideLocked: {
    value: false,
    label: 'Hide locked chapters',
    type: 'Switch',
  },
};

pluginSettings = pluginInputs;
```

Read values at request time instead of caching them in class fields. This keeps
the plugin correct after a user changes settings.

```ts
import { inputs } from '@libs/pluginInputs';

function serverUrl() {
  return inputs.get('url')?.trim() || '';
}
```

## Using Cheerio

Use Cheerio for HTML/XML parsing instead of regular expressions.

```ts
import { load as parseHTML } from 'cheerio';

const $ = parseHTML(html);
const title = $('h1').first().text().trim();
const chapters = $('a.chapter')
  .map((_, link) => ({
    name: $(link).text().trim(),
    path: $(link).attr('href') || '',
  }))
  .get()
  .filter(chapter => chapter.name && chapter.path);
```

For XML or OPDS feeds, enable XML mode:

```ts
const $ = parseHTML(xml, { xmlMode: true });
```

## Fetching

Use `@libs/fetch` helpers for plugin-owned network requests. In Norea,
these route through the host plugin fetch path.

```ts
import { fetchApi, fetchText } from '@libs/fetch';

const response = await fetchApi('https://example.com/api/books', {
  headers: {
    Accept: 'application/json',
  },
});
const data = JSON.parse(await response.text());

const html = await fetchText('https://example.com/book/1');
```

When a request should use a different browser preparation URL than `plugin.site`,
pass `contextUrl`. This is useful for official REST APIs whose homepage is slow
or unrelated to API fetches.

```ts
await fetchApi('https://library.oapen.org/rest/search?query=dc.type:book', {
  headers: {
    Accept: 'application/json',
  },
  contextUrl: 'https://library.oapen.org/rest/search?query=dc.type:book&limit=1',
});
```

Avoid bare `fetch` unless you have verified it is supported by the host contract.
Do not log credentials, cookies, tokens, or full request bodies.

## Storage

`@libs/pluginInputs` exposes app-managed input values declared by
`pluginInputs`. `@libs/storage` remains available for plugin-owned state.

```ts
import { storage } from '@libs/storage';

storage.set('lastQuery', 'love');
const lastQuery = storage.get('lastQuery');
storage.delete('lastQuery');
```

In Norea, storage is namespaced by plugin id. Do not store secrets unless
the host explicitly supports the required security model. `type: 'Password'`
only masks the input UI; it is not an encryption boundary.
