import { load as parseHTML } from 'cheerio';
import type { CheerioAPI } from 'cheerio';

import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const BASE_URL = 'https://www.gutenberg.org';
const SITE_URL = `${BASE_URL}/`;
const PAGE_SIZE = 25;
const HTML_PREFIX = 'gutenberg-html:';
const USER_AGENT = 'Norea/0.1 (+https://github.com/tinywind/norea)';
type CheerioSelection = ReturnType<CheerioAPI>;

function requestInit(accept: string) {
  return {
    headers: {
      Accept: accept,
      'User-Agent': USER_AGENT,
    },
  };
}

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(href?: string) {
  if (!href) return undefined;
  if (/^(https?:|data:)/i.test(href)) return href;
  return new URL(href, SITE_URL).href;
}

function pageStart(pageNo: number) {
  return Math.max(1, (pageNo - 1) * PAGE_SIZE + 1);
}

function bookPathFromOpdsHref(href?: string) {
  const match = href?.match(/^\/ebooks\/(\d+)\.opds$/);
  return match ? `ebooks/${match[1]}.opds` : undefined;
}

function bookIdFromNovelPath(novelPath: string) {
  return novelPath.match(/^ebooks\/(\d+)\.opds$/)?.[1] ?? '';
}

function htmlChapterPath(bookId: string) {
  return `${HTML_PREFIX}${bookId}`;
}

function htmlUrlForBook(bookId: string) {
  return `${BASE_URL}/cache/epub/${bookId}/pg${bookId}-images.html`;
}

function extractField(content: string, label: string, stopLabels: string[]) {
  const normalized = content.replace(/\r\n/g, '\n');
  const marker = `${label}:`;
  const start = normalized.indexOf(marker);
  if (start < 0) return '';

  const valueStart = start + marker.length;
  let valueEnd = normalized.length;

  for (const stopLabel of stopLabels) {
    const stop = normalized.indexOf(`\n${stopLabel}:`, valueStart);
    if (stop >= 0 && stop < valueEnd) valueEnd = stop;
  }

  return cleanText(normalized.slice(valueStart, valueEnd));
}

class ProjectGutenberg implements Plugin.PluginBase {
  id = 'projectgutenberg';
  name = 'Project Gutenberg';
  version = '0.1.0';
  icon = 'siteNotAvailable.png';
  getBaseUrl(): string {
    return SITE_URL;
  }

  async popularNovels(pageNo: number) {
    const url = `${BASE_URL}/ebooks/search.opds/?sort_order=downloads&start_index=${pageStart(
      pageNo,
    )}`;
    const result = await fetchApi(
      url,
      requestInit('application/atom+xml, application/xml;q=0.9, */*;q=0.8'),
    );
    const xml = await result.text();
    return this.parseOpdsList(xml);
  }

  async searchNovels(searchTerm: string, pageNo: number) {
    const query = searchTerm.trim();
    if (!query) return this.popularNovels(pageNo);

    const url = `${BASE_URL}/ebooks/search.opds/?query=${encodeURIComponent(
      query,
    )}&start_index=${pageStart(pageNo)}`;
    const result = await fetchApi(
      url,
      requestInit('application/atom+xml, application/xml;q=0.9, */*;q=0.8'),
    );
    const xml = await result.text();
    return this.parseOpdsList(xml);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = new URL(novelPath, SITE_URL).href;
    const result = await fetchApi(
      url,
      requestInit('application/atom+xml, application/xml;q=0.9, */*;q=0.8'),
    );
    const xml = await result.text();
    const $ = parseHTML(xml, { xmlMode: true });
    const entry = this.findEbookEntry($);

    if (!entry) {
      return {
        name: 'Unknown Project Gutenberg ebook',
        path: novelPath,
        status: 'Unknown',
        chapters: [],
      };
    }

    const metadata = this.parseEbookMetadata($, entry);
    const bookId = bookIdFromNovelPath(novelPath);

    return {
      ...metadata,
      path: novelPath,
      status: metadata.status || 'Public domain in the USA',
      chapters: bookId
        ? [
            {
              name: 'Full ebook',
              path: htmlChapterPath(bookId),
              chapterNumber: 1,
              contentType: 'html',
            },
          ]
        : [],
    };
  }

  async parseNovelSince(novelPath: string): Promise<Plugin.SourceNovel> {
    return this.parseNovel(novelPath);
  }

  async parseChapter(chapterPath: string) {
    if (!chapterPath.startsWith(HTML_PREFIX)) return '';

    const bookId = chapterPath.slice(HTML_PREFIX.length);
    const result = await fetchApi(
      htmlUrlForBook(bookId),
      requestInit('text/html, */*;q=0.8'),
    );
    const html = await result.text();
    const $ = parseHTML(html);
    $('script, style, nav, #pg-header, #pg-footer, .pg-boilerplate').remove();
    $('img[src], a[href]').each((_, element) => {
      const attrName = $(element).is('img') ? 'src' : 'href';
      const attrValue = $(element).attr(attrName);
      if (attrValue) {
        $(element).attr(
          attrName,
          new URL(attrValue, htmlUrlForBook(bookId)).href,
        );
      }
    });

    return $('body').html() || '';
  }

  resolveUrl(path: string) {
    if (path.startsWith(HTML_PREFIX)) {
      const bookId = path.slice(HTML_PREFIX.length);
      return htmlUrlForBook(bookId);
    }

    const bookId = path.match(/^ebooks\/(\d+)\.opds$/)?.[1];
    if (bookId) return `${BASE_URL}/ebooks/${bookId}`;

    return new URL(path, SITE_URL).href;
  }

  private parseOpdsList(xml: string) {
    const $ = parseHTML(xml, { xmlMode: true });
    const novels: Plugin.NovelItem[] = [];

    $('entry').each((_, entry) => {
      const path = bookPathFromOpdsHref(
        $(entry).find('link[rel="subsection"]').attr('href'),
      );
      if (!path) return;

      const name = cleanText($(entry).children('title').first().text());
      if (!name) return;

      const cover =
        toAbsoluteUrl(
          $(entry)
            .find('link[rel="http://opds-spec.org/image/thumbnail"]')
            .attr('href'),
        ) ??
        toAbsoluteUrl(
          $(entry).find('link[rel="http://opds-spec.org/image"]').attr('href'),
        );

      novels.push({ name, path, cover });
    });

    return novels;
  }

  private findEbookEntry($: CheerioAPI) {
    let ebookEntry: CheerioSelection | undefined;

    $('entry').each((_, entry) => {
      if (ebookEntry) return;
      const hasEpub = $(entry).find('link[type="application/epub+zip"]').length;
      if (hasEpub) ebookEntry = $(entry);
    });

    return ebookEntry;
  }

  private parseEbookMetadata($: CheerioAPI, entry: CheerioSelection) {
    const content = entry.children('content').first().text();
    const author =
      cleanText(entry.children('author').first().find('name').text()) ||
      extractField(content, 'Author', ['Summary', 'Language', 'LoCC']);
    const summary = extractField(content, 'Summary', [
      'Reading Level',
      'Language',
      'LoCC',
      'Subject',
    ]);
    const subjects: string[] = [];

    entry.children('category').each((_, category) => {
      const scheme = $(category).attr('scheme') ?? '';
      const term = cleanText($(category).attr('term'));
      if (term && scheme.includes('LCSH')) subjects.push(term);
    });

    const cover =
      toAbsoluteUrl(
        entry.find('link[rel="http://opds-spec.org/image"]').attr('href'),
      ) ??
      toAbsoluteUrl(
        entry
          .find('link[rel="http://opds-spec.org/image/thumbnail"]')
          .attr('href'),
      );

    return {
      name: cleanText(entry.children('title').first().text()),
      cover,
      author,
      summary,
      genres: subjects.join(','),
      status: cleanText(entry.children('rights').first().text()),
    };
  }
}

export default new ProjectGutenberg();
