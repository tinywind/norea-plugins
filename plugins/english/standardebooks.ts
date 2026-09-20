import { load as parseHTML } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

const SITE = 'https://standardebooks.org/';
const BASE_URL = 'https://standardebooks.org';

function toAbsoluteUrl(path?: string) {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `${BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

function toPluginPath(path?: string) {
  if (!path) return '';
  const absoluteUrl = toAbsoluteUrl(path);
  if (!absoluteUrl) return '';
  return new URL(absoluteUrl).pathname.replace(/^\/+/, '');
}

function cleanText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function requestUrl(path: string) {
  return `${BASE_URL}/${path.replace(/^\/+/, '')}`;
}

async function fetchHtml(url: string) {
  const response = await fetchApi(url);
  if (!response.ok) {
    throw new Error(
      `Standard Ebooks request failed: HTTP ${response.status} for ${url}`,
    );
  }
  return response.text();
}

class StandardEbooks implements Plugin.PluginBase {
  apiVersion = '0.2' as const;
  id = 'standard-ebooks';
  name = 'Standard Ebooks';
  version = '0.1.1';
  icon = 'siteNotAvailable.png';
  getBaseUrl(): string {
    return SITE;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const url = `${BASE_URL}/ebooks?sort=popularity&page=${pageNo}`;
    const html = await fetchHtml(url);
    return this.parseBookList(html);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const params = new URLSearchParams({
      query: searchTerm,
      page: pageNo.toString(),
    });
    const html = await fetchHtml(`${BASE_URL}/ebooks?${params.toString()}`);
    return this.parseBookList(html);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const [html, tocHtml] = await Promise.all([
      fetchHtml(requestUrl(novelPath)),
      fetchHtml(requestUrl(`${novelPath}/text`)),
    ]);
    const $ = parseHTML(html);
    const toc = parseHTML(tocHtml);
    const chapters: Plugin.ChapterItem[] = [];

    toc('nav#toc a[href]').each((_, element) => {
      const href = toc(element).attr('href');
      const name = cleanText(toc(element).text());
      const path = toPluginPath(
        new URL(href || '', `${requestUrl(novelPath)}/`).href,
      );
      if (!href || !name || this.isNonReadingSection(path)) return;
      chapters.push({
        name,
        path,
        chapterNumber: chapters.length + 1,
        contentType: 'html',
      });
    });

    return {
      name: cleanText($('article.ebook h1[property="schema:name"]').text()),
      path: novelPath,
      cover: toAbsoluteUrl(
        $('meta[property="og:image"]').attr('content') ||
          $('meta[property="schema:image"]').attr('content'),
      ),
      author: cleanText(
        $('article.ebook [property="schema:author"] [property="schema:name"]')
          .first()
          .text(),
      ),
      genres: $('aside#reading-ease ul.tags a')
        .map((_, element) => cleanText($(element).text()))
        .get()
        .join(', '),
      summary: cleanText(
        $('meta[property="schema:description"]').attr('content') ||
          $('meta[name="description"]').attr('content') ||
          '',
      ),
      status: 'Completed',
      chapters,
    };
  }

  async parseNovelSince(novelPath: string): Promise<Plugin.SourceNovel> {
    return this.parseNovel(novelPath);
  }

  getChapterAcquisitionPlan(
    chapterPath: string,
  ): Plugin.ChapterAcquisitionPlan {
    return {
      type: 'page',
      url: requestUrl(chapterPath),
      contentSelector: 'main',
      excludeSelectors: ['nav', 'header'],
      loadStrategy: 'network-idle',
    };
  }

  resolveUrl(path: string) {
    if (/^https?:\/\//i.test(path)) return path;
    return requestUrl(path);
  }

  private parseBookList(html: string): Plugin.NovelItem[] {
    const $ = parseHTML(html);
    return $('ol.ebooks-list li[typeof="schema:Book"]')
      .map((_, element) => {
        const link = $(element).find('p a[property="schema:url"]').first();
        const name = cleanText(
          link.find('[property="schema:name"]').first().text() || link.text(),
        );
        const path = toPluginPath(link.attr('href'));
        return {
          name,
          path,
          cover: toAbsoluteUrl(
            $(element).find('img[property="schema:image"]').attr('src'),
          ),
        };
      })
      .get()
      .filter(novel => novel.name && novel.path);
  }

  private isNonReadingSection(path: string) {
    return /\/text\/(titlepage|imprint|colophon|uncopyright)$/.test(path);
  }
}

export default new StandardEbooks();
