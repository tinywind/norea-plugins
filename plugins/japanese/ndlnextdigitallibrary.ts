import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const SITE_URL = 'https://lab.ndl.go.jp/dl/';
const API_URL = `${SITE_URL}api/book`;
const IIIF_URL = 'https://dl.ndl.go.jp/api/iiif/';
const RECORD_URL = 'https://dl.ndl.go.jp/pid/';
const BOOK_PREFIX = 'book/';
const CHAPTER_PREFIX = 'ndl-public-domain-book:';
const PAGE_SIZE = 20;
const MANGA_NDC_PREFIX = '726';
const MANGA_NDC_SUBCATEGORY = '726.1';
const MANGA_TITLE_PATTERN = /漫画|漫畫|マンガ|まんが/i;
const PUBLIC_DOMAIN_MARK_URL =
  'https://creativecommons.org/publicdomain/mark/1.0/';
const IMAGE_PROCESSING_NOTICE =
  'Image processing: page images are scaled to 1600 pixels wide through the NDL IIIF API; no other image changes are applied by this plugin.';

type NdlBook = {
  id: string;
  title: string;
  responsibility: string;
  publisher: string;
  published: string;
  publishYear: string;
  ndc: string;
  page: string;
};

type IiifResource = {
  '@id'?: unknown;
  service?: { '@id'?: unknown };
};

type IiifManifest = {
  attribution?: unknown;
  license?: unknown;
  metadata?: { label?: unknown; value?: unknown }[];
  sequences?: {
    canvases?: {
      images?: { resource?: IiifResource }[];
    }[];
  }[];
};

function cleanText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(cleanText).filter(Boolean).join(', ');
  }
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character,
  );
}

function normalizeBook(value: unknown): NdlBook | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const id = cleanText(record.id);
  const title = cleanText(record.title);
  if (!/^\d+$/.test(id) || !title) return null;

  return {
    id,
    title,
    responsibility: cleanText(record.responsibility),
    publisher: cleanText(record.publisher),
    published: cleanText(record.published),
    publishYear: cleanText(record.publishyear),
    ndc: cleanText(record.ndc),
    page: cleanText(record.page),
  };
}

function normalizeSearchResults(value: unknown) {
  if (!value || typeof value !== 'object') return [];
  const list = (value as Record<string, unknown>).list;
  if (!Array.isArray(list)) return [];
  return list
    .map(normalizeBook)
    .filter((book): book is NdlBook => Boolean(book));
}

function bookPath(id: string) {
  return `${BOOK_PREFIX}${id}`;
}

function pidFromPath(path: string, prefix: string) {
  if (!path.startsWith(prefix)) {
    throw new Error('Invalid NDL book path.');
  }
  const pid = path.slice(prefix.length);
  if (!/^\d+$/.test(pid)) {
    throw new Error('Invalid NDL book path.');
  }
  return pid;
}

function isManga(book: NdlBook) {
  const classifications = book.ndc.split(/[,\s/]+/);
  return (
    classifications.some(value => value.startsWith(MANGA_NDC_SUBCATEGORY)) ||
    (classifications.some(value => value === MANGA_NDC_PREFIX) &&
      MANGA_TITLE_PATTERN.test(book.title))
  );
}

function manifestMetadata(manifest: IiifManifest, label: string) {
  const entry = manifest.metadata?.find(
    item => cleanText(item.label).toLowerCase() === label.toLowerCase(),
  );
  return cleanText(entry?.value);
}

function assertPublicDomain(manifest: IiifManifest) {
  const restriction = manifestMetadata(manifest, 'Access Restrictions');
  if (restriction.toUpperCase() !== 'PDM') {
    throw new Error('The NDL manifest is not marked as public domain.');
  }
}

function officialIiifBaseUrl(value: unknown, pid: string) {
  const candidate = cleanText(value).replace(/\/+$/, '');
  if (!candidate) return '';

  try {
    const url = new URL(candidate);
    const officialHost = ['dl.ndl.go.jp', 'www.dl.ndl.go.jp'].includes(
      url.hostname,
    );
    return url.protocol === 'https:' &&
      officialHost &&
      url.pathname.startsWith(`/api/iiif/${pid}/`)
      ? url.href.replace(/\/+$/, '')
      : '';
  } catch {
    return '';
  }
}

function manifestImageUrls(manifest: IiifManifest, pid: string) {
  const canvases = manifest.sequences?.[0]?.canvases ?? [];
  return canvases
    .map(canvas => {
      const resource = canvas.images?.[0]?.resource;
      const serviceUrl = officialIiifBaseUrl(resource?.service?.['@id'], pid);
      if (serviceUrl) return `${serviceUrl}/full/1600,/0/default.jpg`;
      return officialIiifBaseUrl(resource?.['@id'], pid);
    })
    .filter(Boolean);
}

function requestInit() {
  return {
    headers: { Accept: 'application/json' },
    contextUrl: SITE_URL,
  };
}

const manifestPromises = new Map<string, Promise<IiifManifest>>();

class NdlNextDigitalLibrary implements Plugin.PluginBase {
  apiVersion = '0.2' as const;
  id = 'ndl-next-digital-library';
  name = 'NDL Public Domain Manga';
  version = '0.1.1';
  icon = 'siteNotAvailable.png';

  getBaseUrl() {
    return SITE_URL;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    return this.searchBooks('漫画', pageNo);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = cleanText(searchTerm);
    if (!query) return this.popularNovels(pageNo);
    return this.searchBooks(query, pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const pid = pidFromPath(novelPath, BOOK_PREFIX);
    const [book, manifest] = await Promise.all([
      this.fetchBook(pid),
      this.fetchManifest(pid),
    ]);

    if (!isManga(book)) {
      throw new Error('The NDL record is not classified as manga.');
    }
    assertPublicDomain(manifest);

    const images = manifestImageUrls(manifest, pid);
    if (!images.length) {
      throw new Error('The NDL manifest contains no readable page images.');
    }

    const attribution = cleanText(manifest.attribution);
    const license = cleanText(manifest.license);
    const description = [
      book.publisher ? `Publisher: ${book.publisher}` : '',
      book.published || book.publishYear
        ? `Published: ${book.published || book.publishYear}`
        : '',
      book.page ? `Catalog pages: ${book.page}` : '',
      attribution ? `Attribution: ${attribution}` : '',
      'Rights: Public Domain Mark (PDM). Rights other than copyright may still apply.',
      IMAGE_PROCESSING_NOTICE,
      license ? `Rights statement: ${license}` : '',
      `Source record: ${RECORD_URL}${pid}`,
    ].filter(Boolean);

    return {
      name: book.title,
      path: bookPath(pid),
      cover: images[0],
      author: book.responsibility,
      genres: 'Manga, Public domain',
      summary: description.join('\n'),
      status: 'Completed',
      chapters: [
        {
          name: 'Full book',
          path: `${CHAPTER_PREFIX}${pid}`,
          chapterNumber: 1,
          contentType: 'html',
        },
      ],
    };
  }

  async parseNovelSince(
    novelPath: string,
    sinceChapterNumber: number,
  ): Promise<Plugin.SourceNovel> {
    const novel = await this.parseNovel(novelPath);
    return {
      ...novel,
      chapters: novel.chapters.filter(
        chapter => chapter.chapterNumber >= sinceChapterNumber,
      ),
    };
  }

  getChapterAcquisitionPlan(
    chapterPath: string,
    contentType: Plugin.ChapterContentType,
  ): Plugin.ChapterAcquisitionPlan {
    if (contentType !== 'html') {
      throw new Error('NDL manga chapters must use HTML content.');
    }
    pidFromPath(chapterPath, CHAPTER_PREFIX);
    return { type: 'resource' };
  }

  async getChapterResource(
    chapterPath: string,
    contentType: Plugin.ChapterContentType,
  ): Promise<Plugin.ChapterResource> {
    if (contentType !== 'html') {
      throw new Error('NDL manga chapters must use HTML content.');
    }
    const pid = pidFromPath(chapterPath, CHAPTER_PREFIX);
    const manifest = await this.fetchManifest(pid);
    assertPublicDomain(manifest);
    const images = manifestImageUrls(manifest, pid);
    if (!images.length) {
      throw new Error('The NDL manifest contains no readable page images.');
    }

    const attribution =
      cleanText(manifest.attribution) || 'National Diet Library, Japan';
    const imageHtml = images
      .map(
        (url, index) =>
          `<p><img src="${escapeHtml(url)}" alt="Page ${index + 1}"></p>`,
      )
      .join('');

    return {
      type: 'content',
      contentType: 'html',
      content: [
        '<article>',
        `<p>${escapeHtml(attribution)}. `,
        `This material is marked with the <a href="${PUBLIC_DOMAIN_MARK_URL}">Public Domain Mark</a>. `,
        'Rights other than copyright may still apply.</p>',
        `<p>${escapeHtml(IMAGE_PROCESSING_NOTICE)}</p>`,
        `<p><a href="${RECORD_URL}${pid}">View the source record</a></p>`,
        imageHtml,
        '</article>',
      ].join(''),
      baseUrl: `${RECORD_URL}${pid}`,
    };
  }

  resolveUrl(path: string) {
    if (path.startsWith(CHAPTER_PREFIX)) {
      return `${RECORD_URL}${pidFromPath(path, CHAPTER_PREFIX)}`;
    }
    if (path.startsWith(BOOK_PREFIX)) {
      return `${RECORD_URL}${pidFromPath(path, BOOK_PREFIX)}`;
    }
    return SITE_URL;
  }

  private async searchBooks(keyword: string, pageNo: number) {
    const page = Math.max(1, Math.floor(pageNo));
    const params = new URLSearchParams({
      keyword,
      size: PAGE_SIZE.toString(),
      from: ((page - 1) * PAGE_SIZE).toString(),
      searchfield: 'metaonly',
      'f-ndc': `${MANGA_NDC_PREFIX}*`,
      withouthighlight: 'true',
    });
    const response = await fetchApi(
      `${API_URL}/search?${params.toString()}`,
      requestInit(),
    );
    if (!response.ok) {
      throw new Error(`NDL search request failed: HTTP ${response.status}`);
    }

    return normalizeSearchResults(await response.json())
      .filter(isManga)
      .map(book => ({
        name: book.title,
        path: bookPath(book.id),
      }));
  }

  private async fetchBook(pid: string) {
    const response = await fetchApi(`${API_URL}/${pid}`, requestInit());
    if (!response.ok) {
      throw new Error(`NDL book request failed: HTTP ${response.status}`);
    }
    const book = normalizeBook(await response.json());
    if (!book || book.id !== pid) {
      throw new Error('NDL returned an invalid book record.');
    }
    return book;
  }

  private fetchManifest(pid: string) {
    const pending = manifestPromises.get(pid);
    if (pending) return pending;

    const manifest = this.loadManifest(pid).catch(error => {
      manifestPromises.delete(pid);
      throw error;
    });
    manifestPromises.set(pid, manifest);
    return manifest;
  }

  private async loadManifest(pid: string): Promise<IiifManifest> {
    const response = await fetchApi(
      `${IIIF_URL}${pid}/manifest.json`,
      requestInit(),
    );
    if (!response.ok) {
      throw new Error(`NDL IIIF request failed: HTTP ${response.status}`);
    }
    const manifest = (await response.json()) as IiifManifest;
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('NDL returned an invalid IIIF manifest.');
    }
    return manifest;
  }
}

export default new NdlNextDigitalLibrary();
