import { load as parseHTML } from 'cheerio';

import { fetchApi } from '@libs/fetch';
import { inputs } from '@libs/pluginInputs';
import { Plugin } from '@/types/plugin';

const API_URL = 'https://api.github.com';
const SITE_URL = 'https://github.com/';
const NOVEL_PREFIX = 'githubdocs-novel:';
const CHAPTER_PREFIX = 'githubdocs-chapter:';
const PAGE_SIZE = 20;
const MAX_REPOS = 10;
const MAX_PATTERN_LENGTH = 240;
const MAX_PATH_LENGTH = 512;
const MAX_TREE_ENTRIES = 10000;
const DEFAULT_MAX_BINARY_MB = 50;
const MARKDOWN_RENDER_MAX_BYTES = 400 * 1024;
const DEFAULT_CHAPTER_PATTERN = '\\.(md|markdown|html|htm|txt|pdf|epub)$';

type RepoConfig = {
  owner: string;
  repo: string;
  ref?: string;
};

type RepoContext = RepoConfig & {
  fullName: string;
  displayRef: string;
  treeSha: string;
  private: boolean;
};

type GitHubRepoResponse = {
  default_branch?: string;
  private?: boolean;
};

type GitHubBranchResponse = {
  commit?: {
    commit?: {
      tree?: {
        sha?: string;
      };
    };
  };
};

type GitHubCommitResponse = {
  sha?: string;
  tree?: {
    sha?: string;
  };
};

type GitHubRefResponse = {
  object?: {
    sha?: string;
    type?: string;
  };
};

type GitHubTagResponse = {
  object?: {
    sha?: string;
    type?: string;
  };
};

type GitTreeEntry = {
  path?: string;
  type?: 'blob' | 'tree' | 'commit';
  sha?: string;
  size?: number;
};

type GitTreeResponse = {
  tree?: GitTreeEntry[];
  truncated?: boolean;
};

type WorkPayload = {
  owner: string;
  repo: string;
  ref: string;
  treeSha: string;
  rootPath: string;
  title: string;
  private: boolean;
};

type ChapterPayload = WorkPayload & {
  filePath: string;
  sha: string;
  size: number;
  contentType: Plugin.ChapterContentType;
};

function cleanText(value?: string | null) {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function inputValue(key: string) {
  return cleanText(inputs.get(key));
}

function encodePayload(prefix: string, payload: object) {
  return `${prefix}${encodeURIComponent(JSON.stringify(payload))}`;
}

function decodePayload<T>(prefix: string, value: string): T {
  if (!value.startsWith(prefix)) throw new Error('Invalid GitHub Docs path');
  return JSON.parse(decodeURIComponent(value.slice(prefix.length))) as T;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function encodePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function fileName(path: string) {
  return path.split('/').pop() || 'chapter';
}

function titleFromPath(path: string, fallback: string) {
  const name = path.split('/').filter(Boolean).pop();
  return name ? name.replace(/[-_]+/g, ' ') : fallback;
}

function contentTypeFromPath(path: string): Plugin.ChapterContentType {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.epub')) return 'epub';
  if (lower.endsWith('.txt')) return 'text';
  return 'html';
}

function binaryMediaType(
  contentType: Plugin.ChapterContentType,
): Plugin.ChapterBinaryMediaType {
  if (contentType === 'epub') return 'application/epub+zip';
  return 'application/pdf';
}

function isSupportedDocument(path: string) {
  return /\.(md|markdown|html|htm|txt|pdf|epub)$/i.test(path);
}

function isRemoteUrl(value: string) {
  return /^(?:https?:)?\/\//i.test(value.trim());
}

function safeUrl(value: string) {
  const url = value.trim();
  if (/^https?:\/\//i.test(url)) return true;
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(url)) return true;
  return !/^[a-z][a-z\d+.-]*:/i.test(url);
}

function sanitizeHtml(html: string, allowRemoteUrls = true) {
  const loaded = parseHTML(`<article>${html}</article>`);
  loaded(
    'script, style, iframe, object, embed, form, input, button, link, meta, svg',
  ).remove();
  loaded('*').each((_, element) => {
    const node = loaded(element);
    const attrs = (element as { attribs?: Record<string, string> }).attribs;
    for (const attr of Object.keys(attrs ?? {})) {
      const value = attrs?.[attr] ?? '';
      if (/^on/i.test(attr) || attr === 'srcdoc' || attr === 'style') {
        node.removeAttr(attr);
      }
      if (
        (attr === 'href' || attr === 'src') &&
        (!safeUrl(value) || (!allowRemoteUrls && isRemoteUrl(value)))
      ) {
        node.removeAttr(attr);
      }
    }
  });
  return loaded('article').html() || '';
}

function compilePattern(value: string, label: string) {
  const pattern = cleanText(value);
  if (!pattern) throw new Error(`${label} is not configured.`);
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(`${label} is too long.`);
  }
  if (/\\[1-9]/.test(pattern) || /\(\?<[!=]/.test(pattern)) {
    throw new Error(`${label} uses unsupported regexp features.`);
  }
  return new RegExp(pattern);
}

function childPath(rootPath: string, filePathValue: string) {
  if (!rootPath) return filePathValue;
  if (!filePathValue.startsWith(`${rootPath}/`)) return '';
  return filePathValue.slice(rootPath.length + 1);
}

function naturalCompare(left: string, right: string) {
  return left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

class GitHubDocs implements Plugin.PluginBase {
  id = 'githubdocs';
  name = 'GitHub Docs';
  version = '0.1.0';
  icon = 'siteNotAvailable.png';

  getBaseUrl(): string {
    return SITE_URL;
  }

  async popularNovels(pageNo: number): Promise<Plugin.NovelItem[]> {
    const works = await this.discoverWorks();
    return works.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  }

  async searchNovels(
    searchTerm: string,
    pageNo: number,
  ): Promise<Plugin.NovelItem[]> {
    const query = searchTerm.trim().toLowerCase();
    const works = query
      ? (await this.discoverWorks()).filter(work =>
          [work.name, work.path].join(' ').toLowerCase().includes(query),
        )
      : await this.discoverWorks();
    return works.slice((pageNo - 1) * PAGE_SIZE, pageNo * PAGE_SIZE);
  }

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const payload = decodePayload<WorkPayload>(NOVEL_PREFIX, novelPath);
    this.ensureConfiguredRepo(payload);
    const chapters = await this.pickChapters(payload, 1);

    return {
      name: payload.title,
      path: novelPath,
      author: payload.owner,
      genres: 'GitHub, Documentation',
      summary: `${payload.owner}/${payload.repo}:${payload.rootPath || '/'}`,
      status: 'Completed',
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
      chapters: novel.chapters.filter(
        chapter => chapter.chapterNumber >= sinceChapterNumber,
      ),
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
    const payload = decodePayload<ChapterPayload>(CHAPTER_PREFIX, chapterPath);
    this.ensureConfiguredRepo(payload);

    if (payload.contentType === 'pdf' || payload.contentType === 'epub') {
      return this.binaryFallbackHtml(payload);
    }

    const response = await this.fetchBlob(
      payload,
      'application/vnd.github.raw+json',
    );
    const text = await response.text();

    if (payload.contentType === 'text') return text;
    if (/\.(md|markdown)$/i.test(payload.filePath)) {
      return this.renderMarkdown(text, payload);
    }
    return sanitizeHtml(text, !payload.private);
  }

  async parseChapterResource(
    chapterPath: string,
  ): Promise<Plugin.ChapterBinaryResource> {
    const payload = decodePayload<ChapterPayload>(CHAPTER_PREFIX, chapterPath);
    this.ensureConfiguredRepo(payload);
    if (payload.contentType !== 'pdf' && payload.contentType !== 'epub') {
      throw new Error('GitHub Docs chapter is not a binary resource.');
    }
    if (payload.size > this.maxBinaryBytes()) {
      throw new Error('GitHub Docs binary resource exceeds the size limit.');
    }

    const response = await this.fetchBlob(
      payload,
      'application/vnd.github.raw+json',
    );
    const bytes = await response.arrayBuffer();

    return {
      type: 'binary',
      contentType: payload.contentType,
      mediaType: binaryMediaType(payload.contentType),
      filename: fileName(payload.filePath),
      byteLength: bytes.byteLength,
      bytes,
      fallbackHtml: this.binaryFallbackHtml(payload),
    };
  }

  resolveUrl(path: string): string {
    if (path.startsWith(NOVEL_PREFIX)) {
      const payload = decodePayload<WorkPayload>(NOVEL_PREFIX, path);
      if (payload.private) return `${SITE_URL}${payload.owner}/${payload.repo}`;
      const root = payload.rootPath
        ? `/tree/${encodeURIComponent(payload.ref)}/${encodePath(payload.rootPath)}`
        : '';
      return `${SITE_URL}${payload.owner}/${payload.repo}${root}`;
    }
    if (path.startsWith(CHAPTER_PREFIX)) {
      const payload = decodePayload<ChapterPayload>(CHAPTER_PREFIX, path);
      if (payload.private) return `${SITE_URL}${payload.owner}/${payload.repo}`;
      return `${SITE_URL}${payload.owner}/${payload.repo}/blob/${encodeURIComponent(payload.ref)}/${encodePath(payload.filePath)}`;
    }
    return SITE_URL;
  }

  private async discoverWorks(): Promise<Plugin.NovelItem[]> {
    if (!this.isConfigured()) return [];
    const workPattern = compilePattern(
      inputValue('workPathPattern'),
      'Work path pattern',
    );
    const works = new Map<string, Plugin.NovelItem>();

    for (const config of this.repoConfigs()) {
      const context = await this.repoContext(config);
      const entries = await this.treeEntries(context);
      const candidates = this.workCandidates(entries);

      for (const rootPath of candidates) {
        if (rootPath.length > MAX_PATH_LENGTH) continue;
        const key = `${context.fullName}:${rootPath}`;
        const match = workPattern.exec(key);
        if (!match) continue;
        const title =
          match.groups?.title ||
          match.groups?.work ||
          titleFromPath(rootPath, context.repo);
        const payload: WorkPayload = {
          owner: context.owner,
          repo: context.repo,
          ref: context.displayRef,
          treeSha: context.treeSha,
          rootPath,
          title: cleanText(title),
          private: context.private,
        };
        works.set(key, {
          name: payload.title,
          path: encodePayload(NOVEL_PREFIX, payload),
        });
      }
    }

    return Array.from(works.values()).sort((left, right) =>
      naturalCompare(left.name, right.name),
    );
  }

  private async pickChapters(
    work: WorkPayload,
    startChapterNumber: number,
  ): Promise<Plugin.ChapterItem[]> {
    const pattern = compilePattern(
      inputValue('chapterFilePattern') || DEFAULT_CHAPTER_PATTERN,
      'Chapter file pattern',
    );
    const entries = await this.treeEntries(work);
    const chapterEntries = entries
      .filter(entry => entry.type === 'blob' && entry.path && entry.sha)
      .filter(entry => {
        const path = entry.path || '';
        if (!isSupportedDocument(path)) return false;
        const relativePath = childPath(work.rootPath, path);
        if (!relativePath || relativePath.length > MAX_PATH_LENGTH)
          return false;
        return (
          pattern.test(relativePath) ||
          pattern.test(`${work.owner}/${work.repo}:${path}`)
        );
      })
      .sort((left, right) => naturalCompare(left.path || '', right.path || ''));

    return chapterEntries.map((entry, index) => {
      const path = entry.path || '';
      const contentType = contentTypeFromPath(path);
      const payload: ChapterPayload = {
        ...work,
        filePath: path,
        sha: entry.sha || '',
        size: entry.size || 0,
        contentType,
      };
      return {
        name: titleFromPath(path, `Chapter ${index + 1}`),
        path: encodePayload(CHAPTER_PREFIX, payload),
        chapterNumber: startChapterNumber + index,
        contentType,
      };
    });
  }

  private workCandidates(entries: GitTreeEntry[]) {
    const candidates = new Set<string>(['']);
    for (const entry of entries) {
      const path = entry.path || '';
      if (!path || path.length > MAX_PATH_LENGTH) continue;
      if (entry.type === 'tree') candidates.add(path);
      if (entry.type === 'blob') {
        const parts = path.split('/');
        parts.pop();
        while (parts.length > 0) {
          candidates.add(parts.join('/'));
          parts.pop();
        }
      }
    }
    return Array.from(candidates.values());
  }

  private isConfigured() {
    return Boolean(inputValue('repositories') && inputValue('workPathPattern'));
  }

  private repoConfigs() {
    const values = inputValue('repositories')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, MAX_REPOS);

    return values.map(value => {
      const match = value.match(
        /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:@([^\r\n]+))?$/,
      );
      if (!match) throw new Error('Invalid GitHub repository setting.');
      const ref = cleanText(match[3]);
      if (ref && ref.length > MAX_PATH_LENGTH) {
        throw new Error('GitHub repository ref is too long.');
      }
      return {
        owner: match[1],
        repo: match[2],
        ref: ref || undefined,
      };
    });
  }

  private ensureConfiguredRepo(payload: Pick<RepoConfig, 'owner' | 'repo'>) {
    const allowed = this.repoConfigs().some(
      config => config.owner === payload.owner && config.repo === payload.repo,
    );
    if (!allowed)
      throw new Error('GitHub Docs path is outside configured repositories.');
  }

  private maxBinaryBytes() {
    const value = Number(inputValue('maxBinaryMb'));
    const megabytes =
      Number.isFinite(value) && value > 0 ? value : DEFAULT_MAX_BINARY_MB;
    return megabytes * 1024 * 1024;
  }

  private async repoContext(config: RepoConfig): Promise<RepoContext> {
    const repo = await this.githubJson<GitHubRepoResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`,
    );
    const displayRef = config.ref || repo.default_branch || 'main';
    const treeSha = await this.resolveTreeSha(config, displayRef);
    return {
      ...config,
      fullName: `${config.owner}/${config.repo}`,
      displayRef,
      treeSha,
      private: repo.private === true,
    };
  }

  private async resolveTreeSha(config: RepoConfig, ref: string) {
    const branch = await this.githubJsonOrUndefined<GitHubBranchResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/branches/${encodeURIComponent(ref)}`,
    );
    const branchTreeSha = branch?.commit?.commit?.tree?.sha;
    if (branchTreeSha) return branchTreeSha;

    const tagRef = await this.githubJsonOrUndefined<GitHubRefResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/ref/tags/${encodeURIComponent(ref)}`,
    );
    const tagObject = tagRef?.object;
    if (tagObject?.sha && tagObject.type === 'tag') {
      const tag = await this.githubJson<GitHubTagResponse>(
        `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/tags/${tagObject.sha}`,
      );
      const commitSha = tag.object?.sha;
      if (commitSha) return this.commitTreeSha(config, commitSha);
    }
    if (tagObject?.sha && tagObject.type === 'commit') {
      return this.commitTreeSha(config, tagObject.sha);
    }

    const commit = await this.githubJsonOrUndefined<GitHubCommitResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits/${encodeURIComponent(ref)}`,
    );
    if (commit?.tree?.sha) return commit.tree.sha;

    const tree = await this.githubJsonOrUndefined<GitTreeResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/trees/${encodeURIComponent(ref)}`,
    );
    if (tree?.tree) return ref;

    throw new Error('Failed to resolve GitHub repository ref.');
  }

  private async commitTreeSha(config: RepoConfig, sha: string) {
    const commit = await this.githubJson<GitHubCommitResponse>(
      `/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/git/commits/${sha}`,
    );
    if (!commit.tree?.sha) throw new Error('GitHub commit has no tree.');
    return commit.tree.sha;
  }

  private async treeEntries(
    context: Pick<RepoContext, 'owner' | 'repo' | 'treeSha'>,
  ) {
    const tree = await this.githubJson<GitTreeResponse>(
      `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/git/trees/${context.treeSha}?recursive=1`,
    );
    if (!tree.truncated) return (tree.tree ?? []).slice(0, MAX_TREE_ENTRIES);
    return this.walkTree(context, context.treeSha, '');
  }

  private async walkTree(
    context: Pick<RepoContext, 'owner' | 'repo'>,
    treeSha: string,
    prefix: string,
  ): Promise<GitTreeEntry[]> {
    const response = await this.githubJson<GitTreeResponse>(
      `/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/git/trees/${treeSha}`,
    );
    const entries: GitTreeEntry[] = [];

    for (const entry of response.tree ?? []) {
      const path = [prefix, entry.path].filter(Boolean).join('/');
      const nextEntry = { ...entry, path };
      entries.push(nextEntry);
      if (entries.length >= MAX_TREE_ENTRIES) return entries;
      if (entry.type === 'tree' && entry.sha) {
        entries.push(...(await this.walkTree(context, entry.sha, path)));
      }
      if (entries.length >= MAX_TREE_ENTRIES)
        return entries.slice(0, MAX_TREE_ENTRIES);
    }

    return entries;
  }

  private async renderMarkdown(text: string, payload: ChapterPayload) {
    if (text.length > MARKDOWN_RENDER_MAX_BYTES) {
      return `<pre>${escapeHtml(text)}</pre>`;
    }
    const response = await this.githubRequest('/markdown', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        mode: 'gfm',
        context: `${payload.owner}/${payload.repo}`,
      }),
    });
    return sanitizeHtml(await response.text(), !payload.private);
  }

  private binaryFallbackHtml(payload: ChapterPayload) {
    const label = payload.contentType.toUpperCase();
    return [
      '<article>',
      `<p>${label} binary resource is available through Norea.</p>`,
      `<p>Filename: ${escapeHtml(fileName(payload.filePath))}</p>`,
      '</article>',
    ].join('');
  }

  private async fetchBlob(payload: ChapterPayload, accept: string) {
    return this.githubRequest(
      `/repos/${encodeURIComponent(payload.owner)}/${encodeURIComponent(payload.repo)}/git/blobs/${payload.sha}`,
      { headers: { Accept: accept } },
    );
  }

  private async githubJson<T>(path: string) {
    const response = await this.githubRequest(path);
    return JSON.parse(await response.text()) as T;
  }

  private async githubJsonOrUndefined<T>(path: string) {
    const response = await this.githubRequest(path, {}, true);
    if (response.status === 404) return undefined;
    return JSON.parse(await response.text()) as T;
  }

  private async githubRequest(
    path: string,
    init: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {},
    allowNotFound = false,
  ) {
    const token = inputValue('token');
    if (/[\r\n]/.test(token)) throw new Error('Invalid GitHub token.');
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetchApi(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.body,
    });

    if (allowNotFound && response.status === 404) return response;
    if (!response.ok) {
      throw new Error(`GitHub request failed: HTTP ${response.status}`);
    }
    return response;
  }

  pluginInputs = {
    repositories: {
      value: '',
      label: 'Repositories',
      type: 'Text',
      placeholder: 'owner/repo,owner2/repo2@main',
      required: true,
    },
    token: {
      value: '',
      label: 'GitHub token',
      type: 'Password',
      private: true,
    },
    workPathPattern: {
      value: '',
      label: 'Work path regexp',
      type: 'Text',
      placeholder: 'owner/repo:docs/(?<title>[^/]+)$',
      required: true,
    },
    chapterFilePattern: {
      value: DEFAULT_CHAPTER_PATTERN,
      label: 'Chapter file regexp',
      type: 'Text',
      placeholder: '\\.(md|html|pdf|epub)$',
      required: true,
    },
    maxBinaryMb: {
      value: DEFAULT_MAX_BINARY_MB.toString(),
      label: 'Max binary MB',
      type: 'Number',
    },
  } satisfies Plugin.PluginInputSchema;

  pluginSettings = this.pluginInputs;
}

export default new GitHubDocs();
