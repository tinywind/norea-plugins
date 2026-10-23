# Plugin quickstart

Norea plugins implement the 0.2 source contract from
`src/types/plugin.ts`. Start from `docs/plugin-template.ts`.

## Required identity

```ts
class ExampleSource implements Plugin.PluginBase {
  apiVersion = '0.2' as const;
  id = 'example-source';
  name = 'Example Source';
  version = '1.0.0';
  icon = 'siteNotAvailable.png';
}
```

Use a stable lowercase kebab-case ID. `apiVersion` is the host contract
version; `version` is the source plugin release version.

## Required methods

Implement `getBaseUrl`, `popularNovels`, `searchNovels`, `parseNovel`,
`parseNovelSince`, and `getChapterAcquisitionPlan`.

`parseNovel` and `parseNovelSince` must return the same stable, source-owned
`novelId` for a work. Keep `path` as the source locator. See the portable ID
requirements in `docs/docs.md`.

Each chapter needs a stable numeric `chapterNumber`, a path, and an optional
`contentType`. The default content type is `html`.

## Page chapters

Normal website chapters use a page plan:

```ts
getChapterAcquisitionPlan(
  chapterPath: string,
): Plugin.ChapterAcquisitionPlan {
  return {
    type: 'page',
    url: new URL(chapterPath, this.getBaseUrl()).href,
    contentSelector: '.chapter-content',
    excludeSelectors: ['.advertisement'],
    loadStrategy: 'network-idle',
  };
}
```

The Norea host navigates the scraper WebView, captures the selected DOM,
stores partial HTML, downloads media with the global resource slot limit, and
resumes from its manifest. Preserve signed query parameters and access keys in
the plan URL.

Rendered or shadow-DOM content may use `documentStartScript` to place the final
content in a synthetic light-DOM container. The script must not post its own
capture result. Add `data-norea-manual-action` when login, a challenge, or a
paid gate needs user interaction. Use the exact value `captcha` or
`cloudflare` for those access challenges:

```js
const marker = document.createElement('div');
marker.setAttribute('data-norea-manual-action', 'captcha');
document.body.appendChild(marker);
```

The host validates the current absolute HTTP(S) URL, derives the shared
source-session scope from its hostname, and asks the user to complete the
challenge before queued work resumes. Verification uses one real queued task
as a canary rather than trusting cached chapter content, and remains disabled
until such a task is queued. The script only reports the challenge; it must not
attempt to solve or bypass it. Other manual gates retain their existing marker
values. If a sanctioned rendered-page helper throws a structured challenge
error, rethrow it without converting it to a string.

## Resource chapters

Use `{ type: 'resource' }` only for non-page APIs, archives, PDF, or EPUB.
Implement `getChapterResource` and return either a text-like content resource
or a binary resource.

```ts
getChapterAcquisitionPlan(): Plugin.ChapterAcquisitionPlan {
  return { type: 'resource' };
}

async getChapterResource(path: string): Promise<Plugin.ChapterResource> {
  const response = await fetchApi(path);
  const bytes = await response.arrayBuffer();
  return {
    type: 'binary',
    contentType: 'pdf',
    mediaType: 'application/pdf',
    bytes,
    byteLength: bytes.byteLength,
  };
}
```

Use sanctioned fetch shims for all plugin-owned source traffic. Do not copy
cookies into a separate HTTP client.
