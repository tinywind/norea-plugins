import { load as parseHTML } from 'cheerio';

import { readZipText } from '@libs/archive';
import { parseCsv } from '@libs/csv';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const SITE_URL = 'https://www.aozora.gr.jp/';
const CATALOG_ZIP_URL =
  'https://www.aozora.gr.jp/index_pages/list_person_all_extended_utf8.zip';
const PAGE_SIZE = 25;
const ZIP_TEXT_MAX_BYTES = 24 * 1024 * 1024;
const BOOK_PREFIX = 'book/';
const HTML_PREFIX = 'aozora-html:';
const TEXT_PREFIX = 'aozora-text:';
const NO_COPYRIGHT_MARK = '\u306a\u3057';
const AUTHOR_ROLE_MARK = '\u8457\u8005';

type AozoraBook = {
  id: string;
  name: string;
  path: string;
  author: string;
  genres: string;
  summary: string;
  cardUrl: string;
  htmlUrl: string;
  htmlEncoding: string;
  textUrl: string;
  textEncoding: string;
  publishedAt: string;
};

let catalogPromise: Promise<AozoraBook[]> | undefined;

function requestInit(accept: string) {
  return {
    headers: {
      Accept: accept,
      'User-Agent': 'Norea/0.1 (+https://github.com/tinywind/norea)',
    },
  };
}

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeEncoding(value?: string) {
  const encoding = (value ?? '').replace(/[\s_-]/g, '').toLowerCase();
  if (encoding === 'shiftjis' || encoding === 'sjis') return 'shift-jis';
  if (encoding === 'utf8' || encoding === 'utf') return 'utf-8';
  return 'utf-8';
}

function decodeBytes(buffer: ArrayBuffer, encoding?: string) {
  return new TextDecoder(normalizeEncoding(encoding)).decode(buffer);
}

function toAbsoluteUrl(url: string) {
  return new URL(url, SITE_URL).href;
}

function joinName(lastName: string, firstName: string) {
  return cleanText(`${lastName}${firstName}`);
}

function bookPath(workId: string, cardUrl: string) {
  return `${BOOK_PREFIX}${workId}:${encodeURIComponent(cardUrl)}`;
}

function parseBookPath(path: string) {
  const payload = path.slice(BOOK_PREFIX.length);
  const separator = payload.indexOf(':');

  if (separator < 0) {
    return { id: payload, cardUrl: '' };
  }

  return {
    id: payload.slice(0, separator),
    cardUrl: decodeURIComponent(payload.slice(separator + 1)),
  };
}

function chapterPath(prefix: string, url: string, encoding: string) {
  return `${prefix}${encodeURIComponent(encoding)}:${encodeURIComponent(url)}`;
}

function parseChapterPath(path: string, prefix: string) {
  const payload = path.slice(prefix.length);
  const separator = payload.indexOf(':');
  if (separator < 0) {
    return { encoding: 'utf-8', url: decodeURIComponent(payload) };
  }

  return {
    encoding: decodeURIComponent(payload.slice(0, separator)),
    url: decodeURIComponent(payload.slice(separator + 1)),
  };
}

function cleanAozoraText(text: string) {
  const normalized = text.replace(/\r\n/g, '\n');
  const delimiter = '-------------------------------------------------------';
  const firstDelimiter = normalized.indexOf(delimiter);
  const secondDelimiter =
    firstDelimiter >= 0
      ? normalized.indexOf(delimiter, firstDelimiter + delimiter.length)
      : -1;

  if (firstDelimiter >= 0 && secondDelimiter >= 0) {
    return normalized.slice(secondDelimiter + delimiter.length).trim();
  }

  return normalized.trim();
}

async function loadCatalog() {
  const response = await fetchApi(
    CATALOG_ZIP_URL,
    requestInit('application/zip, */*;q=0.8'),
  );
  const csv = await readZipText(await response.arrayBuffer(), {
    extension: 'csv',
    encoding: 'utf-8',
    maxBytes: ZIP_TEXT_MAX_BYTES,
  });
  const rows = parseCsv(csv.replace(/^\uFEFF/, '')) as string[][];
  const books = new Map<string, AozoraBook & { authors: string[] }>();

  for (const row of rows.slice(1)) {
    const workId = cleanText(row[0]);
    if (!workId || row[10] !== NO_COPYRIGHT_MARK) continue;

    const title = cleanText([row[1], row[4]].filter(Boolean).join(' '));
    const cardUrl = cleanText(row[13]);
    const existing = books.get(workId);
    const personName =
      cleanText(`${row[21]} ${row[22]}`) || joinName(row[15], row[16]);

    if (!existing) {
      books.set(workId, {
        id: workId,
        name: title,
        path: bookPath(workId, cardUrl),
        author: '',
        authors: row[23] === AUTHOR_ROLE_MARK && personName ? [personName] : [],
        genres: cleanText(row[8]),
        summary: [
          row[27] ? `Base text: ${cleanText(row[27])}` : '',
          row[43] ? `Input: ${cleanText(row[43])}` : '',
          row[44] ? `Proofreading: ${cleanText(row[44])}` : '',
          cardUrl ? `Source record: ${cardUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        cardUrl,
        htmlUrl: cleanText(row[50]),
        htmlEncoding: cleanText(row[52]),
        textUrl: cleanText(row[45]),
        textEncoding: cleanText(row[47]),
        publishedAt: cleanText(row[11]),
      });
    } else if (row[23] === AUTHOR_ROLE_MARK && personName) {
      existing.authors.push(personName);
    }
  }

  return Array.from(books.values()).map(book => ({
    ...book,
    author: Array.from(new Set(book.authors)).join(', '),
  }));
}

class AozoraBunko implements Plugin.PluginBase {
  id = 'aozorabunko';
  name = 'Aozora Bunko';
  version = '0.1.0';
  icon = 'siteNotAvailable.png';
  getBaseUrl(): string {
    return SITE_URL;
  }

  async popularNovels(pageNo: number) {
    const catalog = await this.catalog();
    const sorted = [...catalog].sort((a, b) =>
      b.publishedAt.localeCompare(a.publishedAt),
    );
    return this.toNovelItems(sorted, pageNo);
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return this.popularNovels(pageNo);

    const catalog = await this.catalog();
    const results = catalog.filter(book =>
      [book.name, book.author, book.genres]
        .join(' ')
        .toLowerCase()
        .includes(query),
    );

    return this.toNovelItems(results, pageNo);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const catalog = await this.catalog();
    const { id } = parseBookPath(novelPath);
    const book = catalog.find(item => item.id === id);

    if (!book) {
      return {
        name: 'Unknown Aozora Bunko work',
        path: novelPath,
        status: 'Unknown',
        chapters: [],
      };
    }

    const chapters: Plugin.ChapterItem[] = [];
    if (book.htmlUrl) {
      chapters.push({
        name: 'Full text',
        contentType: 'html',
        chapterNumber: 1,
        path: chapterPath(
          HTML_PREFIX,
          toAbsoluteUrl(book.htmlUrl),
          book.htmlEncoding,
        ),
      });
    } else if (book.textUrl) {
      chapters.push({
        name: 'Full text',
        contentType: 'text',
        chapterNumber: 1,
        path: chapterPath(
          TEXT_PREFIX,
          toAbsoluteUrl(book.textUrl),
          book.textEncoding,
        ),
      });
    }

    return {
      name: book.name,
      path: book.path,
      author: book.author,
      genres: book.genres,
      summary: book.summary,
      status: 'Completed',
      chapters,
    };
  }

  async parseNovelSince(novelPath: string): Promise<Plugin.SourceNovel> {
    return this.parseNovel(novelPath);
  }

  async parseChapter(chapterPathValue: string) {
    if (chapterPathValue.startsWith(HTML_PREFIX)) {
      const { encoding, url } = parseChapterPath(chapterPathValue, HTML_PREFIX);
      const response = await fetchApi(url);
      const html = decodeBytes(await response.arrayBuffer(), encoding);
      const $ = parseHTML(html);
      $('script, style, nav').remove();
      $('img[src], a[href]').each((_, element) => {
        const attrName = $(element).is('img') ? 'src' : 'href';
        const attrValue = $(element).attr(attrName);
        if (attrValue) $(element).attr(attrName, new URL(attrValue, url).href);
      });
      return $('.main_text').first().html() || $('body').html() || '';
    }

    if (chapterPathValue.startsWith(TEXT_PREFIX)) {
      const { encoding, url } = parseChapterPath(chapterPathValue, TEXT_PREFIX);
      const response = await fetchApi(
        url,
        requestInit('application/zip, */*;q=0.8'),
      );
      const body = await response.arrayBuffer();

      if (!/\.zip$/i.test(url)) {
        return cleanAozoraText(decodeBytes(body, encoding));
      }

      return cleanAozoraText(
        await readZipText(body, {
          extension: 'txt',
          encoding,
          maxBytes: ZIP_TEXT_MAX_BYTES,
        }),
      );
    }

    return '';
  }

  resolveUrl(path: string) {
    if (path.startsWith(HTML_PREFIX)) {
      return parseChapterPath(path, HTML_PREFIX).url;
    }

    if (path.startsWith(TEXT_PREFIX)) {
      return parseChapterPath(path, TEXT_PREFIX).url;
    }

    if (path.startsWith(BOOK_PREFIX)) {
      const { cardUrl } = parseBookPath(path);
      return cardUrl || SITE_URL;
    }

    return SITE_URL;
  }

  private async catalog() {
    catalogPromise ||= loadCatalog();
    return catalogPromise;
  }

  private toNovelItems(books: AozoraBook[], pageNo: number) {
    const start = Math.max(0, (pageNo - 1) * PAGE_SIZE);
    return books.slice(start, start + PAGE_SIZE).map(book => ({
      name: book.name,
      path: book.path,
    }));
  }
}

export default new AozoraBunko();
