export const NovelStatus = {
  Ongoing: 'Ongoing',
  Completed: 'Completed',
  Cancelled: 'Cancelled',
  OnHiatus: 'On Hiatus',
} as const;

export type NovelStatus = (typeof NovelStatus)[keyof typeof NovelStatus];

const NOVEL_STATUS_VALUES: ReadonlySet<string> = new Set(
  Object.values(NovelStatus),
);

export function isNovelStatus(value: unknown): value is NovelStatus {
  return typeof value === 'string' && NOVEL_STATUS_VALUES.has(value);
}

export const PluginInstallModes = {
  Single: 'single',
  MultiSource: 'multiSource',
} as const;

export type PluginInstallMode =
  (typeof PluginInstallModes)[keyof typeof PluginInstallModes];

const PLUGIN_INSTALL_MODE_VALUES: ReadonlySet<string> = new Set(
  Object.values(PluginInstallModes),
);

export function isPluginInstallMode(
  value: unknown,
): value is PluginInstallMode {
  return typeof value === 'string' && PLUGIN_INSTALL_MODE_VALUES.has(value);
}

export const PluginInputTypes = {
  Text: 'Text',
  Url: 'Url',
  Password: 'Password',
  Number: 'Number',
  Switch: 'Switch',
  Select: 'Select',
} as const;

export type PluginInputType =
  (typeof PluginInputTypes)[keyof typeof PluginInputTypes];

const PLUGIN_INPUT_TYPE_VALUES: ReadonlySet<string> = new Set(
  Object.values(PluginInputTypes),
);

export function isPluginInputType(value: unknown): value is PluginInputType {
  return typeof value === 'string' && PLUGIN_INPUT_TYPE_VALUES.has(value);
}

export const ChapterContentTypes = {
  Html: 'html',
  Text: 'text',
  Pdf: 'pdf',
  Markdown: 'markdown',
  Epub: 'epub',
} as const;

export type ChapterContentType =
  (typeof ChapterContentTypes)[keyof typeof ChapterContentTypes];

const CHAPTER_CONTENT_TYPE_VALUES: ReadonlySet<string> = new Set(
  Object.values(ChapterContentTypes),
);

export function isChapterContentType(
  value: unknown,
): value is ChapterContentType {
  return typeof value === 'string' && CHAPTER_CONTENT_TYPE_VALUES.has(value);
}

export const ChapterBinaryMediaTypes = {
  Pdf: 'application/pdf',
  Epub: 'application/epub+zip',
} as const;

export type ChapterBinaryMediaType =
  (typeof ChapterBinaryMediaTypes)[keyof typeof ChapterBinaryMediaTypes];

const CHAPTER_BINARY_MEDIA_TYPE_VALUES: ReadonlySet<string> = new Set(
  Object.values(ChapterBinaryMediaTypes),
);

export function isChapterBinaryMediaType(
  value: unknown,
): value is ChapterBinaryMediaType {
  return (
    typeof value === 'string' && CHAPTER_BINARY_MEDIA_TYPE_VALUES.has(value)
  );
}

export const ChapterCaptureLoadStrategies = {
  Selector: 'selector',
  NetworkIdle: 'network-idle',
  ScrollToEnd: 'scroll-to-end',
} as const;

export type ChapterCaptureLoadStrategy =
  (typeof ChapterCaptureLoadStrategies)[keyof typeof ChapterCaptureLoadStrategies];

const CHAPTER_CAPTURE_LOAD_STRATEGY_VALUES: ReadonlySet<string> = new Set(
  Object.values(ChapterCaptureLoadStrategies),
);

export function isChapterCaptureLoadStrategy(
  value: unknown,
): value is ChapterCaptureLoadStrategy {
  return (
    typeof value === 'string' && CHAPTER_CAPTURE_LOAD_STRATEGY_VALUES.has(value)
  );
}

export const ChapterCaptureErrorCodes = {
  InvalidPlan: 'invalid-plan',
  NavigationFailed: 'navigation-failed',
  ManualActionRequired: 'manual-action-required',
  InteractionFailed: 'interaction-failed',
  Timeout: 'timeout',
  ContentNotFound: 'content-not-found',
  CaptureFailed: 'capture-failed',
  Cancelled: 'cancelled',
} as const;

export type ChapterCaptureErrorCode =
  (typeof ChapterCaptureErrorCodes)[keyof typeof ChapterCaptureErrorCodes];

const CHAPTER_CAPTURE_ERROR_CODE_VALUES: ReadonlySet<string> = new Set(
  Object.values(ChapterCaptureErrorCodes),
);

export function isChapterCaptureErrorCode(
  value: unknown,
): value is ChapterCaptureErrorCode {
  return (
    typeof value === 'string' && CHAPTER_CAPTURE_ERROR_CODE_VALUES.has(value)
  );
}

export const SourceAccessChallengeKinds = {
  Captcha: 'captcha',
  Cloudflare: 'cloudflare',
  Forbidden: 'forbidden',
} as const;

export type SourceAccessChallengeKind =
  (typeof SourceAccessChallengeKinds)[keyof typeof SourceAccessChallengeKinds];

const SOURCE_ACCESS_CHALLENGE_KIND_VALUES: ReadonlySet<string> = new Set(
  Object.values(SourceAccessChallengeKinds),
);

export function isSourceAccessChallengeKind(
  value: unknown,
): value is SourceAccessChallengeKind {
  return (
    typeof value === 'string' && SOURCE_ACCESS_CHALLENGE_KIND_VALUES.has(value)
  );
}

export const SourceAccessErrorCodes = {
  ManualActionRequired: 'manual-action-required',
  SourceAccessRequired: 'source-access-required',
} as const;

export type SourceAccessErrorCode =
  (typeof SourceAccessErrorCodes)[keyof typeof SourceAccessErrorCodes];

const SOURCE_ACCESS_ERROR_CODE_VALUES: ReadonlySet<string> = new Set(
  Object.values(SourceAccessErrorCodes),
);

export function isSourceAccessErrorCode(
  value: unknown,
): value is SourceAccessErrorCode {
  return (
    typeof value === 'string' && SOURCE_ACCESS_ERROR_CODE_VALUES.has(value)
  );
}

export const WebViewInteractionTypes = {
  Click: 'click',
  Type: 'type',
  Select: 'select',
  WaitFor: 'waitFor',
} as const;

export type WebViewInteractionType =
  (typeof WebViewInteractionTypes)[keyof typeof WebViewInteractionTypes];

const WEBVIEW_INTERACTION_TYPE_VALUES: ReadonlySet<string> = new Set(
  Object.values(WebViewInteractionTypes),
);

export function isWebViewInteractionType(
  value: unknown,
): value is WebViewInteractionType {
  return (
    typeof value === 'string' && WEBVIEW_INTERACTION_TYPE_VALUES.has(value)
  );
}

export const defaultCover =
  'https://raw.githubusercontent.com/tinywind/norea-plugins/0.2/public/static/coverNotAvailable.webp';
