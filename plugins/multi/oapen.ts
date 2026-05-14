import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const SITE_URL = 'https://library.oapen.org/';
const REST_URL = `${SITE_URL}rest`;
const REST_CONTEXT_URL = `${REST_URL}/search?query=dc.type:book&limit=1`;
const PAGE_SIZE = 25;
const HANDLE_PREFIX = 'handle/';
const ITEM_PREFIX = 'item/';
const LINK_PREFIX = 'link/';
const FILE_PREFIX = 'oapen-file:';

type OapenMetadata = {
  key?: string;
  value?: string;
  language?: string;
};

type OapenBitstream = {
  name?: string;
  format?: string;
  mimeType?: string;
  bundleName?: string;
  code?: string;
  retrieveLink?: string;
  link?: string;
  url?: string;
};

type OapenItem = {
  uuid?: string;
  name?: string;
  handle?: string;
  link?: string;
  metadata?: OapenMetadata[];
  bitstreams?: OapenBitstream[];
};

type OapenFilePayload = {
  recordUrl: string;
  fileUrl: string;
  label: string;
  mimeType: string;
};

function requestInit(accept = 'application/json') {
  return {
    headers: {
      Accept: accept,
      'User-Agent': 'Norea/0.1 (+https://github.com/tinywind/norea)',
    },
    contextUrl: REST_CONTEXT_URL,
  };
}

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(path?: string) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, SITE_URL).href;
}

function pageOffset(pageNo: number) {
  return Math.max(0, (pageNo - 1) * PAGE_SIZE);
}

function encodeFilePayload(payload: OapenFilePayload) {
  return `${FILE_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodeFilePayload(path: string): OapenFilePayload {
  try {
    return JSON.parse(decodeURIComponent(path.slice(FILE_PREFIX.length)));
  } catch {
    return {
      recordUrl: SITE_URL,
      fileUrl: SITE_URL,
      label: 'Open access file',
      mimeType: 'text/html',
    };
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeResults(data: unknown): OapenItem[] {
  if (Array.isArray(data)) return data as OapenItem[];

  const root = objectRecord(data);
  if (!root) return [];

  for (const key of ['items', 'results', 'resources', 'resource']) {
    if (Array.isArray(root[key])) return root[key] as OapenItem[];
  }

  const embedded = objectRecord(root._embedded);
  const searchResult = objectRecord(embedded?.searchResult);
  const searchEmbedded = objectRecord(searchResult?._embedded);
  const embeddedObjects =
    searchEmbedded?.objects ?? embedded?.objects ?? root.objects;

  if (Array.isArray(embeddedObjects)) {
    return embeddedObjects
      .map(entry => {
        const entryEmbedded = objectRecord(objectRecord(entry)?._embedded);
        return (entryEmbedded?.indexableObject ?? entry) as OapenItem;
      })
      .filter(Boolean);
  }

  if (root.uuid || root.handle || root.metadata) return [root as OapenItem];
  return [];
}

function metadataValues(item: OapenItem, keys: string[]) {
  const metadata = item.metadata ?? [];
  return metadata
    .filter(entry => entry.key && keys.includes(entry.key))
    .map(entry => cleanText(entry.value))
    .filter(Boolean);
}

function metadataValue(item: OapenItem, keys: string[]) {
  return metadataValues(item, keys)[0] ?? '';
}

function itemPath(item: OapenItem) {
  if (item.handle) return `${HANDLE_PREFIX}${item.handle}`;
  if (item.uuid) return `${ITEM_PREFIX}${item.uuid}`;
  if (item.link) return `${LINK_PREFIX}${encodeURIComponent(item.link)}`;
  return `${LINK_PREFIX}${encodeURIComponent(SITE_URL)}`;
}

function itemRecordUrl(item: OapenItem) {
  if (item.handle) return `${SITE_URL}handle/${item.handle}`;
  if (item.link) return toAbsoluteUrl(item.link.replace(/^\/rest\//, '/'));
  return SITE_URL;
}

function bitstreamUrl(bitstream: OapenBitstream) {
  return toAbsoluteUrl(
    bitstream.retrieveLink ?? bitstream.url ?? bitstream.link ?? '',
  );
}

function bitstreamLabel(bitstream: OapenBitstream, index: number) {
  return cleanText(bitstream.name) || `Open access file ${index + 1}`;
}

function readableBitstream(bitstream: OapenBitstream) {
  const bundleName = bitstream.bundleName ?? '';
  const mimeType = bitstream.mimeType ?? '';
  const name = bitstream.name ?? '';

  if (bundleName !== 'ORIGINAL' && bundleName !== 'TEXT') return false;

  return (
    mimeType === 'application/pdf' ||
    mimeType === 'application/epub+zip' ||
    mimeType === 'text/plain' ||
    /\.(pdf|epub|txt)$/i.test(name)
  );
}

function bitstreamContentType(
  bitstream: OapenBitstream,
  fileUrl: string,
): Plugin.ChapterContentType {
  const mimeType = (bitstream.mimeType ?? '').toLowerCase();
  const name = bitstream.name ?? '';

  if (
    mimeType === 'application/pdf' ||
    /\.pdf$/i.test(name) ||
    /\.pdf(?:$|[?#])/i.test(fileUrl)
  ) {
    return 'pdf';
  }
  if (
    mimeType === 'application/epub+zip' ||
    /\.epub$/i.test(name) ||
    /\.epub(?:$|[?#])/i.test(fileUrl)
  ) {
    return 'epub';
  }
  if (
    mimeType === 'text/plain' ||
    /\.txt$/i.test(name) ||
    /\.txt(?:$|[?#])/i.test(fileUrl)
  ) {
    return 'text';
  }
  return 'html';
}

function binaryMediaType(
  payload: OapenFilePayload,
): Plugin.ChapterBinaryMediaType | null {
  const mimeType = payload.mimeType.toLowerCase();

  if (
    mimeType === 'application/pdf' ||
    /\.pdf$/i.test(payload.label) ||
    /\.pdf(?:$|[?#])/i.test(payload.fileUrl)
  ) {
    return 'application/pdf';
  }
  if (
    mimeType === 'application/epub+zip' ||
    /\.epub$/i.test(payload.label) ||
    /\.epub(?:$|[?#])/i.test(payload.fileUrl)
  ) {
    return 'application/epub+zip';
  }

  return null;
}

function binaryContentType(
  mediaType: Plugin.ChapterBinaryMediaType,
): Extract<Plugin.ChapterContentType, 'pdf' | 'epub'> {
  return mediaType === 'application/epub+zip' ? 'epub' : 'pdf';
}

class OapenLibrary implements Plugin.PluginBase {
  id = 'oapen';
  name = 'OAPEN Library';
  version = '0.1.3';
  icon = 'siteNotAvailable.png';
  getBaseUrl(): string {
    return SITE_URL;
  }

  async popularNovels(pageNo: number) {
    return this.searchItems('dc.type:book', pageNo);
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    const query = searchTerm.trim();
    if (!query) return this.popularNovels(pageNo);
    return this.searchItems(query, pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const item = await this.fetchItem(novelPath);

    if (!item) {
      return {
        name: 'Unknown OAPEN record',
        path: novelPath,
        status: 'Unknown',
        chapters: [],
      };
    }

    const recordUrl = itemRecordUrl(item);
    const readableBitstreams = (item.bitstreams ?? []).filter(
      readableBitstream,
    );
    const bitstreams = readableBitstreams
      .map((bitstream, index) => ({
        bitstream,
        index,
        url: bitstreamUrl(bitstream),
      }))
      .filter(entry => entry.url);
    const metadataLicenses = metadataValues(item, [
      'dc.rights',
      'dc.rights.uri',
      'dc.rights.license',
      'oapen.license',
    ]);
    const bitstreamLicenses = readableBitstreams
      .map(bitstream => cleanText(bitstream.code))
      .filter(Boolean);
    const license = Array.from(
      new Set([...metadataLicenses, ...bitstreamLicenses]),
    ).join(' ');
    const abstract = metadataValue(item, [
      'dc.description.abstract',
      'dc.description',
    ]);

    const chapters: Plugin.ChapterItem[] = bitstreams.length
      ? bitstreams.map(({ bitstream, index, url }) => ({
          name: bitstreamLabel(bitstream, index),
          contentType: bitstreamContentType(bitstream, url),
          chapterNumber: index + 1,
          path: encodeFilePayload({
            recordUrl,
            fileUrl: url,
            label: bitstreamLabel(bitstream, index),
            mimeType: bitstream.mimeType ?? '',
          }),
        }))
      : [
          {
            name: 'Source record',
            contentType: 'html',
            chapterNumber: 1,
            path: encodeFilePayload({
              recordUrl,
              fileUrl: recordUrl,
              label: 'Source record',
              mimeType: 'text/html',
            }),
          },
        ];

    return {
      name: metadataValue(item, ['dc.title']) || cleanText(item.name),
      path: itemPath(item),
      author: metadataValues(item, [
        'dc.contributor.author',
        'dc.creator',
      ]).join(', '),
      genres: metadataValues(item, [
        'dc.subject',
        'dc.subject.other',
        'dc.subject.classification',
      ]).join(', '),
      summary: [abstract, license ? `License: ${license}` : '']
        .filter(Boolean)
        .join('\n\n'),
      status: 'Completed',
      chapters,
    };
  }

  async parseNovelSince(novelPath: string): Promise<Plugin.SourceNovel> {
    return this.parseNovel(novelPath);
  }

  async parseChapter(chapterPath: string) {
    if (!chapterPath.startsWith(FILE_PREFIX)) return '';

    const payload = decodeFilePayload(chapterPath);
    if (payload.mimeType === 'text/plain' || /\.txt$/i.test(payload.fileUrl)) {
      const response = await fetchApi(
        payload.fileUrl,
        requestInit('text/plain, */*'),
      );
      const text = await response.text();
      return text;
    }

    return [
      '<article>',
      `<p>${escapeHtml(payload.label)} is available as an open access file from OAPEN.</p>`,
      `<p><a href="${escapeHtml(payload.fileUrl)}">Open file</a></p>`,
      `<p><a href="${escapeHtml(payload.recordUrl)}">View source record</a></p>`,
      '</article>',
    ].join('');
  }

  async parseChapterResource(
    chapterPath: string,
  ): Promise<Plugin.ChapterBinaryResource> {
    if (!chapterPath.startsWith(FILE_PREFIX)) {
      throw new Error('OAPEN chapter is not a file resource.');
    }

    const payload = decodeFilePayload(chapterPath);
    const mediaType = binaryMediaType(payload);
    if (!mediaType) {
      throw new Error(`${payload.label} is not a binary PDF/EPUB resource.`);
    }

    const response = await fetchApi(
      payload.fileUrl,
      requestInit(`${mediaType}, */*`),
    );
    if (!response.ok) {
      throw new Error(`Failed to download ${payload.label}.`);
    }
    const bytes = await response.arrayBuffer();

    return {
      type: 'binary',
      contentType: binaryContentType(mediaType),
      mediaType,
      filename: payload.label,
      byteLength: bytes.byteLength,
      bytes,
    };
  }

  resolveUrl(path: string) {
    if (path.startsWith(FILE_PREFIX)) {
      return decodeFilePayload(path).recordUrl;
    }

    if (path.startsWith(HANDLE_PREFIX)) {
      return `${SITE_URL}handle/${path.slice(HANDLE_PREFIX.length)}`;
    }

    if (path.startsWith(LINK_PREFIX)) {
      return toAbsoluteUrl(decodeURIComponent(path.slice(LINK_PREFIX.length)));
    }

    return SITE_URL;
  }

  private async searchItems(query: string, pageNo: number) {
    const params = new URLSearchParams({
      query,
      expand: 'metadata,bitstreams',
      limit: PAGE_SIZE.toString(),
      offset: pageOffset(pageNo).toString(),
    });
    const response = await fetchApi(
      `${REST_URL}/search?${params}`,
      requestInit(),
    );
    const data = JSON.parse(await response.text());
    return normalizeResults(data)
      .map(item => ({
        name: metadataValue(item, ['dc.title']) || cleanText(item.name),
        path: itemPath(item),
      }))
      .filter(item => item.name && item.path);
  }

  private async fetchItem(novelPath: string) {
    const response = await fetchApi(this.itemApiUrl(novelPath), requestInit());
    const data = JSON.parse(await response.text());
    return normalizeResults(data)[0];
  }

  private itemApiUrl(novelPath: string) {
    if (novelPath.startsWith(HANDLE_PREFIX)) {
      const handle = novelPath.slice(HANDLE_PREFIX.length);
      const params = new URLSearchParams({
        query: `handle:"${handle}"`,
        expand: 'metadata,bitstreams',
      });
      return `${REST_URL}/search?${params}`;
    }

    if (novelPath.startsWith(ITEM_PREFIX)) {
      return `${REST_URL}/items/${novelPath.slice(
        ITEM_PREFIX.length,
      )}?expand=metadata,bitstreams`;
    }

    if (novelPath.startsWith(LINK_PREFIX)) {
      const link = decodeURIComponent(novelPath.slice(LINK_PREFIX.length));
      return `${toAbsoluteUrl(link)}?expand=metadata,bitstreams`;
    }

    return `${REST_URL}/search?query=${encodeURIComponent(
      novelPath,
    )}&expand=metadata,bitstreams`;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default new OapenLibrary();
