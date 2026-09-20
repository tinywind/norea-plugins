import { fetchApi } from '@libs/fetch';
import { inputs } from '@libs/pluginInputs';
import { Plugin } from '@/types/plugin';

const SITE_URL = 'https://www.peppercarrot.com/';
const EPISODES_URL = `${SITE_URL}0_sources/episodes.json`;
const WORK_PREFIX = 'language/';
const CHAPTER_PREFIX = 'pepper-carrot-episode:';
const LANGUAGE_INPUT = 'pepperCarrotLanguage';
const DEFAULT_LANGUAGE = 'en';
const LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';

type PepperCarrotEpisode = {
  name: string;
  number: number;
  totalPages: number;
  translatedLanguages: string[];
};

type ChapterPayload = {
  episodeName: string;
  language: string;
  totalPages: number;
};

let episodesPromise: Promise<PepperCarrotEpisode[]> | undefined;

function cleanText(value: unknown) {
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

function validLanguageCode(value: unknown) {
  const code = cleanText(value);
  return /^[a-z0-9_-]{2,16}$/i.test(code) ? code : '';
}

function languageCode(value: unknown) {
  return validLanguageCode(value) || DEFAULT_LANGUAGE;
}

function configuredLanguage() {
  return languageCode(inputs.get(LANGUAGE_INPUT));
}

function workPath(language: string) {
  return `${WORK_PREFIX}${encodeURIComponent(language)}`;
}

function languageFromWorkPath(path: string) {
  if (!path.startsWith(WORK_PREFIX)) return configuredLanguage();
  return languageCode(decodeURIComponent(path.slice(WORK_PREFIX.length)));
}

function episodeNumber(name: string) {
  const match = /^ep(\d+)_/i.exec(name);
  return match ? Number(match[1]) : 0;
}

function episodeTitle(episode: PepperCarrotEpisode) {
  const title = episode.name
    .replace(/^ep\d+_/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return `Episode ${episode.number}: ${title}`;
}

function normalizeEpisode(value: unknown): PepperCarrotEpisode | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const name = cleanText(record.name);
  const number = episodeNumber(name);
  const totalPages = Number(record.total_pages);
  const translatedLanguages = Array.isArray(record.translated_languages)
    ? record.translated_languages.map(validLanguageCode).filter(Boolean)
    : [];

  if (
    !/^ep\d+_[a-z0-9_-]+$/i.test(name) ||
    !Number.isInteger(number) ||
    number < 1 ||
    !Number.isInteger(totalPages) ||
    totalPages < 0 ||
    totalPages > 1000
  ) {
    return null;
  }

  return {
    name,
    number,
    totalPages,
    translatedLanguages: Array.from(new Set(translatedLanguages)),
  };
}

function normalizeEpisodes(value: unknown) {
  const candidates = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.values(value as Record<string, unknown>)
      : [];

  return candidates
    .map(normalizeEpisode)
    .filter((episode): episode is PepperCarrotEpisode => Boolean(episode))
    .sort((left, right) => left.number - right.number);
}

function encodeChapter(payload: ChapterPayload) {
  return `${CHAPTER_PREFIX}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodeChapter(path: string): ChapterPayload {
  if (!path.startsWith(CHAPTER_PREFIX)) {
    throw new Error('Invalid Pepper&Carrot chapter path.');
  }

  let value: unknown;
  try {
    value = JSON.parse(decodeURIComponent(path.slice(CHAPTER_PREFIX.length)));
  } catch {
    throw new Error('Invalid Pepper&Carrot chapter path.');
  }

  if (!value || typeof value !== 'object') {
    throw new Error('Invalid Pepper&Carrot chapter path.');
  }

  const record = value as Record<string, unknown>;
  const episodeName = cleanText(record.episodeName);
  const language = validLanguageCode(record.language);
  const totalPages = Number(record.totalPages);

  if (
    !/^ep\d+_[a-z0-9_-]+$/i.test(episodeName) ||
    !language ||
    !Number.isInteger(totalPages) ||
    totalPages < 0 ||
    totalPages > 1000
  ) {
    throw new Error('Invalid Pepper&Carrot chapter path.');
  }

  return { episodeName, language, totalPages };
}

function episodeImageUrl(payload: ChapterPayload, pageNumber: number) {
  const number = episodeNumber(payload.episodeName).toString().padStart(2, '0');
  const page = pageNumber.toString().padStart(2, '0');
  return `${SITE_URL}0_sources/${payload.episodeName}/low-res/${payload.language}_Pepper-and-Carrot_by-David-Revoy_E${number}P${page}.jpg`;
}

function sourcePageUrl(payload: ChapterPayload) {
  return `${SITE_URL}en/webcomic-sources/${payload.episodeName}.html`;
}

class PepperCarrot implements Plugin.PluginBase {
  apiVersion = '0.2' as const;
  id = 'pepper-carrot';
  name = 'Pepper&Carrot';
  version = '0.1.1';
  icon = 'siteNotAvailable.png';
  pluginInputs = {
    [LANGUAGE_INPUT]: {
      value: DEFAULT_LANGUAGE,
      label: 'Language code',
      type: 'Text',
      placeholder: 'en, kr, ja',
      required: true,
    },
  } satisfies Plugin.PluginInputSchema;
  pluginSettings = this.pluginInputs;

  getBaseUrl() {
    return SITE_URL;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];
    return [this.novelItem(configuredLanguage())];
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = cleanText(searchTerm).toLowerCase();
    if (!query) return this.popularNovels(pageNo);
    if (pageNo !== 1) return [];

    return ['pepper&carrot', 'pepper and carrot', 'david revoy'].some(value =>
      value.includes(query),
    )
      ? [this.novelItem(configuredLanguage())]
      : [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const language = languageFromWorkPath(novelPath);
    const episodes = (await this.episodes()).filter(episode =>
      episode.translatedLanguages.includes(language),
    );

    if (!episodes.length) {
      throw new Error(
        `Pepper&Carrot has no episodes for language code '${language}'.`,
      );
    }

    const chapters = Array.from(
      new Map(
        episodes.map(episode => {
          const path = encodeChapter({
            episodeName: episode.name,
            language,
            totalPages: episode.totalPages,
          });
          return [
            path,
            {
              name: episodeTitle(episode),
              path,
              chapterNumber: episode.number,
              contentType: 'html' as const,
            },
          ];
        }),
      ).values(),
    ).sort((left, right) => left.chapterNumber - right.chapterNumber);

    return {
      ...this.novelItem(language),
      author: 'David Revoy',
      artist: 'David Revoy',
      genres: 'Fantasy, Comedy, Webcomic',
      summary:
        "Official Pepper&Carrot comic pages licensed under CC BY 4.0. Translation and contributor credits are included on each episode's final page.",
      status: 'Ongoing',
      chapters,
    };
  }

  async parseNovelSince(
    novelPath: string,
    sinceChapterNumber: number,
  ): Promise<Plugin.SourceNovel> {
    const novel = await this.parseNovel(novelPath);
    return {
      ...novel,
      chapters: novel.chapters
        .filter(chapter => chapter.chapterNumber >= sinceChapterNumber)
        .sort((left, right) => left.chapterNumber - right.chapterNumber),
    };
  }

  getChapterAcquisitionPlan(
    chapterPath: string,
    contentType: Plugin.ChapterContentType,
  ): Plugin.ChapterAcquisitionPlan {
    if (contentType !== 'html') {
      throw new Error('Pepper&Carrot chapters must use HTML content.');
    }
    decodeChapter(chapterPath);
    return { type: 'resource' };
  }

  async getChapterResource(
    chapterPath: string,
    contentType: Plugin.ChapterContentType,
  ): Promise<Plugin.ChapterResource> {
    if (contentType !== 'html') {
      throw new Error('Pepper&Carrot chapters must use HTML content.');
    }
    const payload = decodeChapter(chapterPath);
    const sourceUrl = sourcePageUrl(payload);
    const images = Array.from(
      { length: payload.totalPages + 1 },
      (_, index) => {
        const imageUrl = episodeImageUrl(payload, index);
        return `<p><img src="${escapeHtml(imageUrl)}" alt="Page ${index + 1}"></p>`;
      },
    ).join('');

    return {
      type: 'content',
      contentType: 'html',
      content: [
        '<article>',
        '<p>',
        `Based on <a href="${SITE_URL}">Pepper&amp;Carrot</a> by David Revoy, `,
        `licensed under <a href="${LICENSE_URL}">CC BY 4.0</a>. `,
        'Translation and contributor credits are included on the final page.',
        '</p>',
        images,
        `<p><a href="${escapeHtml(sourceUrl)}">Episode source and credits</a></p>`,
        '</article>',
      ].join(''),
      baseUrl: sourceUrl,
    };
  }

  resolveUrl(path: string) {
    if (path.startsWith(CHAPTER_PREFIX)) {
      const payload = decodeChapter(path);
      return `${SITE_URL}${payload.language}/webcomic/${payload.episodeName}.html`;
    }

    const language = languageFromWorkPath(path);
    return `${SITE_URL}${language}/webcomics/peppercarrot.html`;
  }

  private novelItem(language: string): Plugin.NovelItem {
    return {
      name: 'Pepper&Carrot',
      path: workPath(language),
    };
  }

  private episodes() {
    episodesPromise ||= this.loadEpisodes().catch(error => {
      episodesPromise = undefined;
      throw error;
    });
    return episodesPromise;
  }

  private async loadEpisodes() {
    const response = await fetchApi(EPISODES_URL, {
      headers: { Accept: 'application/json' },
      contextUrl: `${SITE_URL}en/webcomics/peppercarrot.html`,
    });
    if (!response.ok) {
      throw new Error(
        `Pepper&Carrot API request failed: HTTP ${response.status}`,
      );
    }

    const episodes = normalizeEpisodes(await response.json());
    if (!episodes.length) {
      throw new Error('Pepper&Carrot API returned no valid episodes.');
    }
    return episodes;
  }
}

export default new PepperCarrot();
