import { fetchApi } from '@libs/fetch';
import { Filters, FilterTypes } from '@libs/filterInputs';
import { NovelStatus } from '@libs/novelStatus';
import { Plugin } from '@/types/plugin';
import { load as parseHTML } from 'cheerio';
import { storage } from '@libs/storage';
import { inputs } from '@libs/pluginInputs';

const DISPLAY_SITE = 'https://komga.org/';
const URL_SETTING_KEY = 'url';

interface RequestOptions {
  method?: string;
  body?: unknown;
  accept?: string;
}

type SeriesSearchCondition = Record<string, unknown>;

function cleanText(value?: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeBaseUrl(value?: unknown) {
  const raw = cleanText(value);
  if (!raw || raw === URL_SETTING_KEY) return '';

  const withProtocol = /^[a-z][a-z\d+\-.]*:\/\//i.test(raw)
    ? raw
    : `http://${raw}`;

  try {
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
    return parsed.href.endsWith('/') ? parsed.href : `${parsed.href}/`;
  } catch {
    return '';
  }
}

function absoluteUrl(baseUrl: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.replace(/^\/+/, ''), baseUrl).href;
}

function isSelectedFilter(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function equalsCondition(
  field: 'readStatus' | 'seriesStatus',
  value: string,
): SeriesSearchCondition {
  return {
    [field]: {
      operator: 'is',
      value,
    },
  };
}

function searchBody(
  conditions: SeriesSearchCondition[],
  fullTextSearch?: string,
) {
  return {
    ...(fullTextSearch ? { fullTextSearch } : {}),
    ...(conditions.length === 1
      ? { condition: conditions[0] }
      : conditions.length > 1
        ? { condition: { allOf: conditions } }
        : {}),
  };
}

function responseContentType(response: Response) {
  return response.headers.get('content-type')?.split(';')[0].trim() ?? '';
}

class KomgaPlugin implements Plugin.PluginBase {
  id = 'komga';
  name = 'Komga';
  icon = 'src/multi/komga/icon.png';
  version = '1.0.3';

  site = DISPLAY_SITE;

  private inputValue(key: string) {
    return cleanText(inputs.get(key) ?? storage.get(key));
  }

  private configuredServerUrl() {
    return normalizeBaseUrl(this.inputValue(URL_SETTING_KEY));
  }

  private serverUrl() {
    const url = this.configuredServerUrl();
    if (!url) {
      throw new Error('Komga server URL is not configured.');
    }
    return url;
  }

  async makeResponse(
    url: string,
    {
      method = 'GET',
      body,
      accept = 'application/json, text/plain, */*',
    }: RequestOptions = {},
  ): Promise<Response> {
    const baseUrl = this.serverUrl();
    const headers: Record<string, string> = {
      Accept: accept,
      'Content-Type': 'application/json;charset=utf-8',
    };
    const email = this.inputValue('email');
    const password = this.inputValue('password');

    if (email || password) {
      headers.Authorization = `Basic ${this.btoa(email + ':' + password)}`;
    }

    const response = await fetchApi(absoluteUrl(baseUrl, url), {
      method,
      headers: {
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      Referer: baseUrl,
      contextUrl: baseUrl,
    });

    if (!response.ok) {
      throw new Error(
        `Komga request failed: HTTP ${response.status} ${response.statusText}`,
      );
    }

    return response;
  }

  async makeRequest(
    url: string,
    options: RequestOptions = {},
  ): Promise<string> {
    return await (await this.makeResponse(url, options)).text();
  }

  btoa(input = '') {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const str = input;
    let output = '';

    for (
      let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || ((map = '='), i % 1);
      output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
      charCode = str.charCodeAt((i += 3 / 4));

      if (charCode > 0xff) {
        throw new Error(
          "'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.",
        );
      }

      block = (block << 8) | charCode;
    }

    return output;
  }

  flattenArray(arr: any[] = []) {
    return arr.reduce((acc: any, obj: any) => {
      const { children, ...rest } = obj;
      acc.push(rest);

      if (children) {
        acc.push(...this.flattenArray(children));
      }

      return acc;
    }, []);
  }

  async getSeries(
    url: string,
    body: Record<string, unknown> = {},
  ): Promise<Plugin.NovelItem[]> {
    const novels: Plugin.NovelItem[] = [];
    const baseUrl = this.serverUrl();

    const response = await this.makeRequest(url, {
      method: 'POST',
      body,
    });

    const series = JSON.parse(response).content ?? [];

    for (const s of series) {
      novels.push({
        name: s.name,
        path: 'api/v1/series/' + s.id,
        cover: absoluteUrl(baseUrl, `api/v1/series/${s.id}/thumbnail`),
      });
    }

    return novels;
  }

  async popularNovels(
    pageNo: number,
    {
      showLatestNovels,
      filters,
    }: Plugin.PopularNovelsOptions<typeof this.filters>,
  ): Promise<Plugin.NovelItem[]> {
    if (!this.configuredServerUrl()) return [];

    const sort = showLatestNovels ? 'lastModified,desc' : 'name,asc';
    const params = new URLSearchParams({
      page: (pageNo - 1).toString(),
      sort,
    });
    const conditions: SeriesSearchCondition[] = [];
    const readStatus = filters?.read_status.value;
    const seriesStatus = filters?.status.value;

    if (isSelectedFilter(readStatus)) {
      conditions.push(equalsCondition('readStatus', readStatus));
    }

    if (isSelectedFilter(seriesStatus)) {
      conditions.push(equalsCondition('seriesStatus', seriesStatus));
    }

    const url = `api/v1/series/list?${params}`;

    return await this.getSeries(url, searchBody(conditions));
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: 'Untitled',
    };

    const baseUrl = this.serverUrl();

    const response = await this.makeRequest(novelPath);

    const series = JSON.parse(response);

    novel.name = series.name;
    novel.author = series.booksMetadata.authors
      .filter((author: any) => author.role === 'writer')
      .reduce(
        (accumulated: string, current: any) =>
          accumulated + (accumulated !== '' ? ', ' : '') + current.name,
        '',
      );
    novel.cover = absoluteUrl(baseUrl, `api/v1/series/${series.id}/thumbnail`);
    novel.genres = series.metadata.genres.join(', ');

    switch (series.metadata.status) {
      case 'ENDED':
        novel.status = NovelStatus.Completed;
        break;
      case 'ONGOING':
        novel.status = NovelStatus.Ongoing;
        break;
      case 'ABANDONED':
        novel.status = NovelStatus.Cancelled;
        break;
      case 'HIATUS':
        novel.status = NovelStatus.OnHiatus;
        break;
      default:
        novel.status = NovelStatus.Unknown;
    }

    novel.summary = series.booksMetadata.summary;

    const chapters: Plugin.ChapterItem[] = [];

    const booksResponse = await this.makeRequest(
      `api/v1/series/${series.id}/books?unpaged=true`,
    );

    const booksData = JSON.parse(booksResponse).content;

    for (const book of booksData) {
      const bookManifestResponse = await this.makeRequest(
        `opds/v2/books/${book.id}/manifest`,
      );

      const bookManifest = JSON.parse(bookManifestResponse);

      const toc = this.flattenArray(bookManifest.toc);

      let i = 1;
      for (const page of bookManifest.readingOrder) {
        const tocItem = toc.find(
          (v: any) => v.href?.split('#')[0] === page.href,
        );
        const title = tocItem ? tocItem.title : null;
        chapters.push({
          name: `${i}/${bookManifest.readingOrder.length} - ${book.metadata.title}${title ? ' - ' + title : ''}`,
          path: 'opds/v2' + page.href?.split('opds/v2').pop(),
          contentType: 'html',
        });
        i++;
      }
    }

    novel.chapters = chapters;
    return novel;
  }
  async parseChapter(chapterPath: string): Promise<string> {
    const baseUrl = this.serverUrl();
    const response = await this.makeResponse(chapterPath, {
      accept: 'application/xhtml+xml, text/html, image/*, */*',
    });
    const contentType = responseContentType(response);

    if (contentType.startsWith('image/')) {
      return this.imageResponseToHtml(response, contentType);
    }

    const chapterText = await response.text();
    return this.addUrlToImageHref(
      chapterText,
      absoluteUrl(baseUrl, chapterPath.split('/').slice(0, -1).join('/') + '/'),
    );
  }

  async imageResponseToHtml(response: Response, contentType: string) {
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error('Komga image page is empty.');
    }

    return `<p><img src="data:${contentType};base64,${this.arrayBufferToBase64(
      bytes,
    )}" alt="Komga page" /></p>`;
  }

  arrayBufferToBase64(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;

    for (let index = 0; index < bytes.length; index += chunkSize) {
      binary += String.fromCharCode(
        ...bytes.subarray(index, index + chunkSize),
      );
    }

    return this.btoa(binary);
  }

  // Convert images to <img> tag and correct url
  addUrlToImageHref(htmlString: string, baseUrl: string): string {
    const $ = parseHTML(htmlString, { xmlMode: true });

    // Convert SVG <image> elements to <img> and add baseUrl if necessary
    $('svg image').each((_, image) => {
      const href = $(image).attr('href') || $(image).attr('xlink:href');
      const width = $(image).attr('width');
      const height = $(image).attr('height');

      if (href) {
        const img = $('<img />').attr({
          src: absoluteUrl(baseUrl, href),
          width: width || undefined,
          height: height || undefined,
        });
        $(image).closest('svg').replaceWith(img);
      }
    });

    // Update <img> elements to include the base URL if their src is relative
    $('img').each((_, img) => {
      const src = $(img).attr('src');
      if (src && !src.startsWith('http')) {
        $(img).attr('src', absoluteUrl(baseUrl, src));
      }
    });

    // Replace <a> tags with the text inside so its not blue
    $('a').each((_, a) => {
      $(a).replaceWith($(a).text());
    });

    return $.xml();
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    if (!this.configuredServerUrl()) return [];

    const params = new URLSearchParams({
      page: (pageNo - 1).toString(),
    });
    const url = `api/v1/series/list?${params}`;

    return await this.getSeries(url, searchBody([], searchTerm));
  }

  filters = {
    status: {
      value: '',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'ENDED' },
        { label: 'Ongoing', value: 'ONGOING' },
        { label: 'Cancelled', value: 'ABANDONED' },
        { label: 'OnHiatus', value: 'HIATUS' },
      ],
      type: FilterTypes.Picker,
    },
    read_status: {
      value: '',
      label: 'Read status',
      options: [
        { label: 'All', value: '' },
        { label: 'Unread', value: 'UNREAD' },
        { label: 'Read', value: 'READ' },
        { label: 'In progress', value: 'IN_PROGRESS' },
      ],
      type: FilterTypes.Picker,
    },
  } satisfies Filters;

  pluginInputs = {
    url: {
      value: '',
      label: 'Server URL',
      type: 'Url',
      placeholder: 'https://komga.example.com/',
      required: true,
    },
    email: {
      value: '',
      label: 'Email',
      type: 'Text',
    },
    password: {
      value: '',
      label: 'Password',
      type: 'Password',
      private: true,
    },
  };

  pluginSettings = this.pluginInputs;
}

export default new KomgaPlugin();
