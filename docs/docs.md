# Norea plugin API 0.2

The canonical TypeScript contract is `src/types/plugin.ts`. Every published
source implements `Plugin.PluginBase` and declares:

```ts
apiVersion = '0.2' as const; // "0.2"
```

## Plugin surface

Required fields are `apiVersion`, `id`, `name`, `version`, and `icon`.
Required methods are `getBaseUrl`, `popularNovels`, `searchNovels`,
`parseNovel`, `parseNovelSince`, and `getChapterAcquisitionPlan`.

Optional fields include filters, plugin inputs, image request headers, custom
assets, multi-source installation, and `resolveUrl`.

## Novel identity

`parseNovel` and `parseNovelSince` return a required `SourceNovel.novelId`.
The plugin selects a stable source ID or slug that is unique within its plugin
ID. Keep it unchanged across metadata refreshes, title changes, pagination,
and incremental chapter requests. Use a compound ID only when the source needs
multiple identity parts, such as a repository, ref, and work directory.

`novelId` is one portable directory component of at most 240 UTF-8 bytes. It
must be nonempty, contain well-formed Unicode, and exclude control characters
and `<>:"/\\|?*`. It cannot start with a dot or space, end with a dot or space,
or use a Windows device name such as `CON`, `COM0`, or `LPT9`, including names
with extensions. The suffixes `.tmp`, `.bak`, `.part`, `.partial`, and
`.norea-sync-backup` are reserved.

`plugins/novelId.helper.ts` exports `sourceNovelId(...parts)` for reversible
percent-encoding of source identity parts. Numeric IDs and ordinary slugs stay
readable; unsafe characters, uppercase letters, and reserved names are encoded
to prevent collisions on case-insensitive filesystems. Compound parts are separated by `+`; literal plus signs are escaped.
IDs exceeding the size limit are rejected. The build
inlines this helper into each published plugin. Do not hash or truncate IDs.

The host stores chapters under `contents/{pluginId}/{novelId}/{chapterNumber}`.
The source `path` remains the original browsing and parsing locator; it is not
a storage directory. `NovelItem` search results do not require `novelId`.

## Chapter plans

`getChapterAcquisitionPlan(chapterPath, contentType)` is synchronous and must
not perform network traffic or mutate state.

```ts
type ChapterAcquisitionPlan =
  | {
      type: 'page';
      url: string;
      contentSelector: string;
      readySelector?: string;
      excludeSelectors?: string[];
      documentStartScript?: string;
      loadStrategy?: 'selector' | 'network-idle' | 'scroll-to-end';
      cacheBust?: boolean;
      timeoutMs?: number;
    }
  | { type: 'resource' };
```

Page plans are the default for website content. The host owns navigation, DOM
capture, sanitization, browser-cache reuse, media downloading, manifests,
archives, cancellation, and resume behavior. `cacheBust` adds a host query
value while preserving all source parameters.

Use `documentStartScript` only to prepare rendered content. It may observe
source responses and inject a stable light-DOM root. It must not emit its own
WebView result.

## Access challenges

Mark a CAPTCHA or Cloudflare access challenge in the page DOM with one of the
following values:

```html
<div data-norea-manual-action="captcha"></div>
<div data-norea-manual-action="cloudflare"></div>
```

The host converts a recognized marker to the additive API 0.2 failure
envelope:

```ts
type SourceAccessChallenge = {
  kind: 'captcha' | 'cloudflare';
  url: string;
};

type ChapterCaptureFailureEnvelope =
  | {
      ok: false;
      code: 'manual-action-required';
      error: string;
      challenge?: SourceAccessChallenge;
    }
  | {
      ok: false;
      code: Exclude<ChapterCaptureErrorCode, 'manual-action-required'>;
      error: string;
      challenge?: never;
    };
```

`challenge` is meaningful only when `code` is `manual-action-required`. Its
URL must be an absolute HTTP(S) URL. The host validates and normalizes that URL
and derives the affected source-session scope from its hostname; plugins do
not choose the queue scope.

Sanctioned rendered-page helpers may reject with an `Error` carrying the same
`code` and `challenge` fields. Plugin methods must preserve that structured
error when adding context; converting it to a string prevents the host from
pausing the affected source-session queue.

Current hosts pause the full affected source queue and keep individual and
batch downloads pending. After the user completes the check, the host runs one
queued task as a canary. Chapter canaries bypass stored-content resume paths,
and the queue resumes only after a real acquisition completes successfully. If
no eligible source request or chapter download is queued, verification remains
disabled until one is added.

The marker only reports that user interaction is required. Plugins must not
solve, bypass, or simulate completion of a CAPTCHA or Cloudflare challenge.
Other manual gates may continue using legacy marker values without a
`challenge` payload. Older hosts still interpret either recognized marker as
a generic `manual-action-required` failure, and newer hosts continue to accept
legacy envelopes without `challenge`.

## Explicit resources

Resource plans require `getChapterResource(chapterPath, contentType)`.

```ts
type ChapterResource =
  | {
      type: 'content';
      contentType: 'html' | 'text' | 'markdown';
      content: string;
      baseUrl?: string;
    }
  | {
      type: 'binary';
      contentType: 'pdf' | 'epub';
      mediaType: 'application/pdf' | 'application/epub+zip';
      bytes: ArrayBuffer | Uint8Array;
      filename?: string;
      byteLength?: number;
    };
```

Use resources for documented connector APIs, archive decoding, PDF, and EPUB,
not as an alternative HTTP parser for ordinary chapter pages.

`baseUrl` resolves relative media and prepares media transport only. It does
not select the source-access scope or replace the trusted acquisition URL. API
0.2 does not declare additional authentication origins, so a CDN requiring its
own top-level manual verification cannot be authenticated as a separate scope.

## Paths, authentication, and traffic

Paths may be relative, absolute, or opaque encoded payloads. Keep credentials
in private plugin inputs or request init objects. Do not persist secrets in
novel paths, chapter paths, or content.

All source traffic uses the sanctioned fetch and WebView shims so the Norea
scraper session owns cookies and challenge state. Page plan URLs must retain
every signed parameter and media access key.

See `docs/quickstart.md` and `docs/plugin-template.ts` for a minimal source.
