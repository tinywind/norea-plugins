import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Code,
  Copy,
  Download,
  FileText,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useAppStore } from '@/store';
import { usePluginCustomAssets } from '@/hooks/usePluginCustomAssets';
import {
  createEpubPreview,
  type EpubPreviewResult,
} from '@/lib/epub-preview';
import type { Plugin } from '@/types/plugin';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function chapterContentToHtml(
  content: string,
  contentType: Plugin.ChapterContentType | undefined,
) {
  if (contentType === 'text') {
    return `<pre>${escapeHtml(content)}</pre>`;
  }
  return content;
}

type LoadedBinaryResource = Plugin.ChapterBinaryResource & {
  objectUrl: string;
};

type PreviewStatus = 'idle' | 'loading' | 'loaded' | 'failed';

type ResourceCheck = {
  label: string;
  detail: string;
  passed: boolean;
};

function bytesToBlob(resource: Plugin.ChapterBinaryResource) {
  return new Blob([resource.bytes], { type: resource.mediaType });
}

function downloadResource(resource: LoadedBinaryResource) {
  const link = document.createElement('a');
  link.href = resource.objectUrl;
  link.download = resource.filename || `chapter.${resource.contentType}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function resourceByteLength(resource: Plugin.ChapterBinaryResource) {
  return resource.bytes.byteLength;
}

function expectedMediaType(contentType: Plugin.ChapterContentType) {
  return contentType === 'epub' ? 'application/epub+zip' : 'application/pdf';
}

function binaryResourceChecks(
  resource: LoadedBinaryResource,
  previewStatus: PreviewStatus,
  epubPreview?: EpubPreviewResult,
  epubPreviewError?: string,
): ResourceCheck[] {
  const byteLength = resourceByteLength(resource);
  const checks: ResourceCheck[] = [
    {
      label: 'Downloaded bytes',
      detail: `${formatBytes(byteLength)} fetched from plugin`,
      passed: byteLength > 0,
    },
    {
      label: 'Declared size',
      detail: `${formatBytes(resource.byteLength)} reported by resource`,
      passed: resource.byteLength === byteLength,
    },
    {
      label: 'Media type',
      detail: resource.mediaType,
      passed: resource.mediaType === expectedMediaType(resource.contentType),
    },
    {
      label: 'Download URL',
      detail: resource.filename || resource.objectUrl,
      passed: resource.objectUrl.startsWith('blob:'),
    },
  ];

  if (resource.contentType === 'pdf') {
    checks.push({
      label: 'PDF render',
      detail:
        previewStatus === 'loaded'
          ? 'Preview iframe loaded'
          : previewStatus === 'failed'
            ? 'Preview iframe failed'
            : 'Preview iframe pending',
      passed: previewStatus === 'loaded',
    });
  } else {
    checks.push({
      label: 'EPUB package',
      detail:
        epubPreview?.packagePath ||
        epubPreviewError ||
        'Waiting for package parse',
      passed: Boolean(epubPreview),
    });
    checks.push({
      label: 'EPUB render',
      detail:
        previewStatus === 'loaded'
          ? epubPreview?.chapterPath || 'Preview iframe loaded'
          : previewStatus === 'failed'
            ? epubPreviewError || 'Preview iframe failed'
            : 'Preview iframe pending',
      passed: previewStatus === 'loaded',
    });
  }

  return checks;
}

function CheckBadge({ check }: { check: ResourceCheck }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3">
      <Badge
        variant="outline"
        className={
          check.passed
            ? 'border-green-500/30 text-green-700 dark:text-green-400'
            : 'border-red-500/30 text-red-700 dark:text-red-400'
        }
      >
        {check.passed ? (
          <CheckCircle2 className="w-3 h-3" />
        ) : (
          <XCircle className="w-3 h-3" />
        )}
        {check.label}
      </Badge>
      <p className="mt-2 text-xs text-muted-foreground break-words">
        {check.detail}
      </p>
    </div>
  );
}

export default function ParseChapterSection() {
  const plugin = useAppStore(state => state.plugin);
  const parseChapterPath = useAppStore(state => state.parseChapterPath);
  const parseChapterContentType = useAppStore(
    state => state.parseChapterContentType,
  );
  const shouldAutoSubmitChapter = useAppStore(
    state => state.shouldAutoSubmitChapter,
  );
  const clearParseChapterPath = useAppStore(
    state => state.clearParseChapterPath,
  );
  const [chapterPath, setChapterPath] = useState('');
  const [chapterText, setChapterText] = useState('');
  const [binaryResource, setBinaryResource] = useState<LoadedBinaryResource>();
  const [epubPreview, setEpubPreview] = useState<EpubPreviewResult>();
  const [epubPreviewError, setEpubPreviewError] = useState('');
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>('idle');
  const [chapterContentType, setChapterContentType] =
    useState<Plugin.ChapterContentType>('html');
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [showRawHtml, setShowRawHtml] = useState(false);

  const chapterHtml = chapterContentToHtml(chapterText, chapterContentType);
  const hasChapterContent = chapterText || binaryResource;
  const { customCSSLoaded, customJSLoaded, customCSSError, customJSError } =
    usePluginCustomAssets(plugin, chapterHtml);

  const fetchChapterByPath = async (
    path: string,
    contentType: Plugin.ChapterContentType = 'html',
  ) => {
    if (plugin && path.trim()) {
      setLoading(true);
      setFetchError('');
      setChapterText('');
      setBinaryResource(undefined);
      setEpubPreview(undefined);
      setEpubPreviewError('');
      setPreviewStatus('idle');
      try {
        if (
          (contentType === 'pdf' || contentType === 'epub') &&
          plugin.parseChapterResource
        ) {
          const result = await plugin.parseChapterResource(path);
          const objectUrl = URL.createObjectURL(bytesToBlob(result));
          let nextEpubPreview: EpubPreviewResult | undefined;
          let nextEpubPreviewError = '';

          if (result.contentType === 'epub') {
            try {
              nextEpubPreview = await createEpubPreview(result);
            } catch (error) {
              nextEpubPreviewError =
                error instanceof Error
                  ? error.message
                  : 'Failed to render EPUB preview';
            }
          }

          setBinaryResource({ ...result, objectUrl });
          setEpubPreview(nextEpubPreview);
          setEpubPreviewError(nextEpubPreviewError);
          setPreviewStatus(
            result.contentType === 'pdf' || nextEpubPreview
              ? 'loading'
              : 'failed',
          );
          setChapterText(result.fallbackHtml || '');
          setChapterContentType(result.contentType);
        } else {
          const result = await plugin.parseChapter(path);
          setChapterText(result);
          setChapterContentType(contentType);
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Failed to fetch chapter';
        setFetchError(errorMessage);
        setPreviewStatus('failed');
        console.error('Error parsing chapter:', error);
      } finally {
        setLoading(false);
      }
    }
  };

  const fetchChapter = async () => {
    await fetchChapterByPath(chapterPath, chapterContentType);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && chapterPath.trim()) {
      fetchChapter();
    }
  };

  const copyToClipboard = (text?: string, label?: string) => {
    if (text) {
      navigator.clipboard.writeText(text);
      toast.success(`${label || 'Text'} copied to clipboard!`);
    }
  };

  const checks = binaryResource
    ? binaryResourceChecks(
        binaryResource,
        previewStatus,
        epubPreview,
        epubPreviewError,
      )
    : [];

  // Handle pre-filled path from navigation
  useEffect(() => {
    return () => {
      if (binaryResource?.objectUrl)
        URL.revokeObjectURL(binaryResource.objectUrl);
    };
  }, [binaryResource?.objectUrl]);

  useEffect(() => {
    if (parseChapterPath) {
      setChapterPath(parseChapterPath);
      setChapterContentType(parseChapterContentType ?? 'html');

      if (shouldAutoSubmitChapter && plugin) {
        fetchChapterByPath(parseChapterPath, parseChapterContentType ?? 'html');
      }

      clearParseChapterPath();
    }
  }, [
    parseChapterPath,
    parseChapterContentType,
    shouldAutoSubmitChapter,
    plugin,
    clearParseChapterPath,
  ]);

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-foreground">
              Parse Chapter
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              {plugin
                ? 'Enter a chapter path to fetch content'
                : 'Select a plugin to parse chapters'}
            </p>
            {plugin && (plugin.customCSS || plugin.customJS) && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  Available:
                </span>
                {plugin.customCSS && (
                  <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/20">
                    Custom CSS
                  </span>
                )}
                {plugin.customJS && (
                  <span className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded border border-purple-500/20">
                    Custom JS
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mb-6">
          <Input
            placeholder="Enter chapter path..."
            value={chapterPath}
            onChange={e => {
              setChapterPath(e.target.value);
            }}
            onKeyPress={handleKeyPress}
            className="flex-1"
            disabled={!plugin}
          />
          <select
            value={chapterContentType}
            onChange={event =>
              setChapterContentType(
                event.target.value as Plugin.ChapterContentType,
              )
            }
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            disabled={!plugin || loading}
          >
            <option value="html">HTML</option>
            <option value="text">Text</option>
            <option value="pdf">PDF</option>
            <option value="epub">EPUB</option>
          </select>
          <Button
            onClick={fetchChapter}
            disabled={!plugin || !chapterPath.trim() || loading}
          >
            {loading ? 'Fetching...' : 'Fetch'}
          </Button>
        </div>

        {fetchError && (
          <div className="p-4 mb-6 border border-destructive/50 bg-destructive/10 rounded-lg">
            <p className="text-sm text-destructive">{fetchError}</p>
          </div>
        )}

        {loading && !hasChapterContent ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-4 w-2/3" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-28" />
              </div>
            </div>
            <div className="border border-border rounded-lg">
              <Skeleton className="h-10 w-full rounded-t-lg" />
              <div className="p-6 space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-10/12" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
              </div>
            </div>
          </div>
        ) : !hasChapterContent ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {plugin ? 'Ready to parse' : 'No plugin selected'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {plugin
                ? 'Enter a chapter path in the field above and click "Fetch" to load the chapter content.'
                : 'Please select a plugin from the sidebar to get started.'}
            </p>
          </div>
        ) : hasChapterContent ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  Chapter Content
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {chapterPath}
                </p>
              </div>
              <div className="flex gap-2 items-center">
                {!binaryResource && (
                  <div className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg bg-muted/50">
                    <Code className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Raw Content
                    </span>
                    <Switch
                      checked={showRawHtml}
                      onCheckedChange={setShowRawHtml}
                    />
                  </div>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-transparent"
                      onClick={() =>
                        copyToClipboard(chapterPath, 'Chapter path')
                      }
                    >
                      <Copy className="w-4 h-4" />
                      Copy Path
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Copy chapter path to clipboard</p>
                  </TooltipContent>
                </Tooltip>
                {binaryResource ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-transparent"
                    data-testid="binary-download-button"
                    onClick={() => downloadResource(binaryResource)}
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2 bg-transparent"
                        onClick={() =>
                          copyToClipboard(chapterText, 'Chapter text')
                        }
                      >
                        <Copy className="w-4 h-4" />
                        Copy Text
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Copy chapter text to clipboard</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            <div className="border border-border rounded-lg">
              <div className="bg-muted/50 rounded-t-lg px-4 py-2 border-b border-border">
                <p className="text-xs text-muted-foreground font-medium">
                  {binaryResource
                    ? `${binaryResource.contentType.toUpperCase()} RESOURCE (${binaryResource.byteLength} bytes)`
                    : `${showRawHtml ? 'RAW CONTENT' : 'CHAPTER CONTENT'} (${chapterText.length} characters)`}
                </p>
              </div>
              <div className="bg-background rounded-b-lg p-6 max-h-[600px] overflow-y-auto">
                {binaryResource ? (
                  <div className="space-y-4">
                    <div
                      className="text-sm text-muted-foreground space-y-1"
                      data-testid="binary-resource-status"
                    >
                      <p>Media type: {binaryResource.mediaType}</p>
                      <p>
                        Size: {formatBytes(resourceByteLength(binaryResource))}
                      </p>
                      {binaryResource.filename && (
                        <p>Filename: {binaryResource.filename}</p>
                      )}
                    </div>
                    <div
                      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                      data-testid="binary-resource-checks"
                    >
                      {checks.map(check => (
                        <CheckBadge key={check.label} check={check} />
                      ))}
                    </div>
                    <div
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                      data-testid="binary-render-status"
                    >
                      {previewStatus === 'loading' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : previewStatus === 'loaded' ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
                      ) : previewStatus === 'failed' ? (
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                      <span>
                        Render status:{' '}
                        {previewStatus === 'loaded'
                          ? 'loaded'
                          : previewStatus === 'failed'
                            ? 'failed'
                            : previewStatus === 'loading'
                              ? 'loading'
                              : 'idle'}
                      </span>
                    </div>
                    {binaryResource.contentType === 'pdf' ? (
                      <iframe
                        key={binaryResource.objectUrl}
                        data-testid="pdf-preview-frame"
                        title={binaryResource.filename || 'PDF chapter'}
                        src={binaryResource.objectUrl}
                        className="w-full h-[520px] rounded border border-border"
                        onLoad={() => setPreviewStatus('loaded')}
                        onError={() => setPreviewStatus('failed')}
                      />
                    ) : epubPreview ? (
                      <iframe
                        key={epubPreview.chapterPath}
                        data-testid="epub-preview-frame"
                        title={epubPreview.title}
                        srcDoc={epubPreview.srcDoc}
                        sandbox=""
                        className="w-full h-[520px] rounded border border-border bg-white"
                        onLoad={() => setPreviewStatus('loaded')}
                        onError={() => setPreviewStatus('failed')}
                      />
                    ) : (
                      <div
                        className="rounded border border-border p-4 text-sm text-muted-foreground"
                        data-testid="epub-preview-error"
                      >
                        EPUB preview failed:{' '}
                        {epubPreviewError || 'No renderable spine item found.'}
                      </div>
                    )}
                    {chapterHtml && (
                      <div
                        className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                        dangerouslySetInnerHTML={{ __html: chapterHtml }}
                      />
                    )}
                  </div>
                ) : showRawHtml ? (
                  <pre className="text-xs text-foreground font-mono whitespace-pre-wrap break-words">
                    {chapterText}
                  </pre>
                ) : (
                  <div
                    className="prose prose-sm dark:prose-invert max-w-none text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: chapterHtml,
                    }}
                  />
                )}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm text-muted-foreground">
                  Content loaded successfully
                </p>
                {plugin?.customCSS && (
                  <span
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                      customCSSLoaded
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                        : customCSSError
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                    }`}
                  >
                    CSS:{' '}
                    {customCSSLoaded
                      ? '✓ Applied'
                      : customCSSError
                        ? '✗ Failed'
                        : '⋯ Loading'}
                  </span>
                )}
                {plugin?.customJS && (
                  <span
                    className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                      customJSLoaded
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                        : customJSError
                          ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
                          : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
                    }`}
                  >
                    JS:{' '}
                    {customJSLoaded
                      ? '✓ Applied'
                      : customJSError
                        ? '✗ Failed'
                        : '⋯ Loading'}
                  </span>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setChapterText('');
                  setBinaryResource(undefined);
                  setEpubPreview(undefined);
                  setEpubPreviewError('');
                  setPreviewStatus('idle');
                  setChapterPath('');
                  setShowRawHtml(false);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
