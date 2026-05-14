import { fetchApi } from '@libs/fetch';
import { inputs } from '@libs/pluginInputs';
import { Plugin } from '@/types/plugin';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const FIXTURE_PATH = 'static/fixtures/content-types/';
const NOVEL_PATH = 'fixture/content-types';
const BASE_URL_INPUT = 'baseUrl';

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function configuredBaseUrl(): string {
  const value = inputs.get(BASE_URL_INPUT)?.trim();
  return withoutTrailingSlash(value || DEFAULT_BASE_URL);
}

function fixtureRootUrl(): string {
  return `${configuredBaseUrl()}/${FIXTURE_PATH}`;
}

class ContentTypeFixturePlugin implements Plugin.PluginBase {
  id = 'dev-content-type-fixture';
  name = 'Dev Content Type Fixture';
  version = '0.1.0';
  icon = 'siteNotAvailable.png';
  getBaseUrl(): string {
    return fixtureRootUrl();
  }
  pluginInputs = {
    [BASE_URL_INPUT]: {
      label: 'Fixture server base URL',
      value: DEFAULT_BASE_URL,
      placeholder: 'http://localhost:3000',
      required: true,
    },
  };

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    return [this.fixtureNovel()];
  }

  async searchNovels(): Promise<Plugin.NovelItem[]> {
    return [this.fixtureNovel()];
  }

  async parseNovel(): Promise<Plugin.SourceNovel> {
    const rootUrl = this.fixtureRootUrl();
    const chapters = {
      html: `${rootUrl}chapters/html/chapter-1.html`,
      text: `${rootUrl}chapters/text/chapter-1.txt`,
      pdf: `${rootUrl}chapters/pdf/chapter-1.pdf`,
    };

    return {
      ...this.fixtureNovel(),
      author: 'Norea fixture',
      status: 'Completed',
      summary:
        'Local development fixture for HTML, plain text, and PDF chapter handling.',
      chapters: [
        {
          name: 'HTML chapter with relative images',
          path: chapters.html,
          chapterNumber: 1,
          contentType: 'html',
        },
        {
          name: 'Plain text chapter',
          path: chapters.text,
          chapterNumber: 2,
          contentType: 'text',
        },
        {
          name: 'PDF chapter fallback',
          path: chapters.pdf,
          chapterNumber: 3,
          contentType: 'pdf',
        },
      ],
    };
  }

  async parseNovelSince(novelPath: string): Promise<Plugin.SourceNovel> {
    return this.parseNovel(novelPath);
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const rootUrl = this.fixtureRootUrl();

    if (chapterPath.endsWith('/chapters/pdf/chapter-1.pdf')) {
      return `<p>This fixture chapter is backed by a PDF file. <a href="${chapterPath}">Open the local PDF fixture</a>.</p>`;
    }

    const response = await fetchApi(chapterPath, {
      contextUrl: rootUrl,
    });
    return response.text();
  }

  resolveUrl(path: string) {
    return path;
  }

  private fixtureNovel(): Plugin.NovelItem {
    const rootUrl = this.fixtureRootUrl();

    return {
      name: 'Norea Content Type Fixture',
      path: NOVEL_PATH,
      cover: `${rootUrl}chapters/shared/cover.svg`,
    };
  }

  private fixtureRootUrl(): string {
    return fixtureRootUrl();
  }
}

export default new ContentTypeFixturePlugin();
