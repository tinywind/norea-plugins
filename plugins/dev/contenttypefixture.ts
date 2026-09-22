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
  apiVersion = '0.2' as const;
  id = 'dev-content-type-fixture';
  name = 'Dev Content Type Fixture';
  version = '0.1.1';
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

  async parseNovelSince(): Promise<Plugin.SourceNovel> {
    return this.parseNovel();
  }

  getChapterAcquisitionPlan(
    chapterPath: string,
    contentType: Plugin.ChapterContentType,
  ): Plugin.ChapterAcquisitionPlan {
    if (contentType === 'pdf') return { type: 'resource' };
    return {
      type: 'page',
      url: chapterPath,
      contentSelector: 'body',
      loadStrategy: 'network-idle',
    };
  }

  async getChapterResource(
    chapterPath: string,
  ): Promise<Plugin.ChapterResource> {
    if (!chapterPath.endsWith('/chapters/pdf/chapter-1.pdf')) {
      throw new Error('Fixture chapter is not a PDF resource.');
    }

    const response = await fetchApi(chapterPath, {
      contextUrl: this.fixtureRootUrl(),
      headers: { Accept: 'application/pdf, */*' },
    });
    if (!response.ok) {
      throw new Error(
        `Fixture PDF request failed with HTTP ${response.status}.`,
      );
    }
    const bytes = await response.arrayBuffer();

    return {
      type: 'binary',
      contentType: 'pdf',
      mediaType: 'application/pdf',
      filename: 'chapter-1.pdf',
      byteLength: bytes.byteLength,
      bytes,
    };
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
