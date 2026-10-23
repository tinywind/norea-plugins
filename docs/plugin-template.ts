import { fetchApi } from '@libs/fetch';
import { Plugin } from '@/types/plugin';

class TemplatePlugin implements Plugin.PluginBase {
  apiVersion = '0.2' as const;
  id = 'example-source';
  name = 'Example Source';
  version = '1.0.0';
  icon = 'siteNotAvailable.png';

  getBaseUrl(): string {
    return 'https://example.com/';
  }

  async popularNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async searchNovels(): Promise<Plugin.NovelItem[]> {
    return [];
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    return {
      novelId: 'example',
      name: 'Example Novel',
      path: novelPath,
      chapters: [
        {
          name: 'Chapter 1',
          path: '/novel/example/chapter-1',
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
  ): Plugin.ChapterAcquisitionPlan {
    return {
      type: 'page',
      url: new URL(chapterPath, this.getBaseUrl()).href,
      contentSelector: 'article.chapter-content',
      excludeSelectors: ['.advertisement'],
      loadStrategy: 'network-idle',
    };
  }

  resolveUrl(path: string): string {
    return new URL(path, this.getBaseUrl()).href;
  }

  async getChapterResource(
    chapterPath: string,
  ): Promise<Plugin.ChapterResource> {
    const response = await fetchApi(chapterPath);
    const bytes = await response.arrayBuffer();
    return {
      type: 'binary',
      contentType: 'pdf',
      mediaType: 'application/pdf',
      bytes,
      byteLength: bytes.byteLength,
    };
  }
}

export default new TemplatePlugin();
