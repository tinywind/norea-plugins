import { FilterToValues, Filters } from '@libs/filterInputs';
export namespace Plugin {
  export const API_VERSION = '0.2' as const;
  export type ApiVersion = typeof API_VERSION;
  export type ChapterCaptureLoadStrategy =
    | 'selector'
    | 'network-idle'
    | 'scroll-to-end';
  export type ChapterCaptureErrorCode =
    | 'invalid-plan'
    | 'navigation-failed'
    | 'manual-action-required'
    | 'timeout'
    | 'content-not-found'
    | 'capture-failed'
    | 'cancelled';
  export type SourceAccessChallengeKind = 'captcha' | 'cloudflare';
  export type SourceAccessChallenge = {
    kind: SourceAccessChallengeKind;
    /** Absolute HTTP(S) URL where the challenge was observed. */
    url: string;
  };
  export type ChapterCaptureFailureEnvelope =
    | {
        ok: false;
        code: 'manual-action-required';
        error: string;
        challenge?: SourceAccessChallenge;
      }
    | {
        ok: false;
        code: Exclude<ChapterCaptureErrorCode, 'manual-action-required'>;
        error: string;
        challenge?: never;
      };
  export type TextChapterContentType = Extract<
    ChapterContentType,
    'html' | 'text' | 'markdown'
  >;
  export type ChapterPageAcquisitionPlan = {
    type: 'page';
    /** Absolute HTTP(S) URL. Preserve required query parameters. */
    url: string;
    /** First matching element becomes the reader content root. */
    contentSelector: string;
    /** Defaults to contentSelector. */
    readySelector?: string;
    /** Elements removed from the cloned content before it is stored. */
    excludeSelectors?: string[];
    /** Runs before source page scripts and may prepare a capturable DOM root. */
    documentStartScript?: string;
    /** Defaults to network-idle. */
    loadStrategy?: ChapterCaptureLoadStrategy;
    /** Add a host-owned query value without discarding existing parameters. */
    cacheBust?: boolean;
    /** Host-clamped total navigation and capture timeout. */
    timeoutMs?: number;
  };
  export type ChapterResourceAcquisitionPlan = {
    type: 'resource';
  };
  export type ChapterAcquisitionPlan =
    | ChapterPageAcquisitionPlan
    | ChapterResourceAcquisitionPlan;
  export type ChapterContentType =
    | 'html'
    | 'text'
    | 'markdown'
    | 'pdf'
    | 'epub';
  export type ChapterBinaryMediaType =
    | 'application/pdf'
    | 'application/epub+zip';

  export type ChapterBinaryResource = {
    type: 'binary';
    contentType: Extract<ChapterContentType, 'pdf' | 'epub'>;
    mediaType: ChapterBinaryMediaType;
    filename?: string;
    byteLength?: number;
    bytes: ArrayBuffer | Uint8Array;
  };
  export type ChapterContentResource = {
    type: 'content';
    contentType: TextChapterContentType;
    content: string;
    /** Absolute URL used to resolve relative media references. */
    baseUrl?: string;
  };
  export type ChapterResource = ChapterContentResource | ChapterBinaryResource;

  export type ChapterItem = {
    name: string;
    path: string;
    /**
     * Defaults to "html".
     */
    contentType?: ChapterContentType;
    /**
     * "YYYY-MM-DD" format or ISO string format
     * ```js
     * chapter.releaseTime = '2023-12-02';
     * chapter.releaseTime = new Date(2023, 12, 02).toISOString();
     * ```
     * or just a string
     */
    releaseTime?: string | null;
    chapterNumber: number;
    /**
     * For novel without pages only
     */
    page?: string;
  };
  export type NovelItem = {
    name: string;
    path: string;
    cover?: string;
  };
  export type SourceNovel = {
    /** Comma separated genre list -> "action,fantasy,romance" */
    genres?: string;
    summary?: string;
    author?: string;
    artist?: string;
    status?: string;
    /** Rating out of 5 as float */
    rating?: number;
    chapters: ChapterItem[];
  } & NovelItem;

  export type SourcePage = {
    chapters: ChapterItem[];
  };

  export type PopularNovelsOptions<
    Q extends Filters | undefined = Filters | undefined,
  > = {
    showLatestNovels?: boolean;
    filters: Q extends undefined ? undefined : FilterToValues<Q>;
  };
  export type InstallMode = 'single' | 'multiSource';
  export type PluginItem = {
    id: string;
    name: string;
    version: string;
    icon: string;
    installMode?: InstallMode;
    /** Host/plugin contract version. */
    apiVersion: ApiVersion;
  };
  export type ImageRequestInit = {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  };
  export type PluginInputValue = string | boolean;
  export type PluginInputOption = {
    label: string;
    value: string;
  };
  export type PluginInputDefinition = {
    value?: PluginInputValue;
    label?: string;
    type?: string;
    placeholder?: string;
    required?: boolean;
    private?: boolean;
    options?: PluginInputOption[];
  };
  export type PluginInputSchema = Record<string, PluginInputDefinition>;

  export type PluginBase = {
    apiVersion: typeof API_VERSION;
    id: string;
    name: string;
    /**
     * Relative path without static. E.g:
     * ```js
     * "src/vi/hakolightnovel/icon.png"
     * ```
     */
    icon: string;
    customJS?: string;
    customCSS?: string;
    imageRequestInit?: ImageRequestInit;
    filters?: Filters;
    installMode?: InstallMode;
    pluginInputs?: PluginInputSchema;
    pluginSettings?: PluginInputSchema | Record<string, unknown>;
    version: string;
    getBaseUrl(): string;
    popularNovels(
      pageNo: number,
      options: PopularNovelsOptions<Filters>,
    ): Promise<NovelItem[]>;
    /**
     *
     * @param novelPath
     * @returns novel metadata and its first page
     */
    parseNovel(novelPath: string): Promise<SourceNovel>;
    parseNovelSince(
      novelPath: string,
      sinceChapterNumber: number,
    ): Promise<SourceNovel>;
    /** Return declarative browser capture or explicit resource acquisition. */
    getChapterAcquisitionPlan(
      chapterPath: string,
      contentType: ChapterContentType,
    ): ChapterAcquisitionPlan;
    /** Fetch non-page API, archive, PDF, or EPUB resources declared by the plan. */
    getChapterResource?(
      chapterPath: string,
      contentType: ChapterContentType,
    ): Promise<ChapterResource>;
    searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]>;
    /** Resolve a source path to an absolute URL; preserve already absolute URLs. */
    resolveUrl?(path: string, isNovel?: boolean): string;
  };

  export type PagePlugin = {
    parseNovel(
      novelPath: string,
    ): Promise<SourceNovel & { totalPages: number }>;
    parseNovelSince(
      novelPath: string,
      sinceChapterNumber: number,
    ): Promise<SourceNovel & { totalPages?: number }>;
    parsePage(novelPath: string, page: string): Promise<SourcePage>;
  } & PluginBase;
}

export namespace HTMLParser2Util {
  type HandlerBase = {
    onopentag?(name: string, attribs: Record<string, string>): void;
    ontext?(data: string): void;
    onclosetag?(name: string, isImplied: boolean): void;
  };

  export type Handler = {
    isStarted?: boolean;
    isDone?: boolean;
  } & HandlerBase;

  // route htmlparser2 event to handlers
  export type HandlerRouter<ActionType extends string> = {
    handlers: Record<ActionType, Handler | undefined>;
    action: ActionType;
  } & HandlerBase;
}
