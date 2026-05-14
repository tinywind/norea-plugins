import JSZip from 'jszip';

import type { Plugin } from '@/types/plugin';

export type EpubPreviewResult = {
  title: string;
  packagePath: string;
  chapterPath: string;
  srcDoc: string;
};

type XmlParent = Document | Element;

function elementsByLocalName(parent: XmlParent, localName: string) {
  return Array.from(parent.getElementsByTagName('*')).filter(
    (element): element is Element => element.localName === localName,
  );
}

function firstElementByLocalName(parent: XmlParent, localName: string) {
  return elementsByLocalName(parent, localName)[0];
}

function parseXml(value: string, label: string) {
  const document = new DOMParser().parseFromString(value, 'application/xml');
  const parseError = document.getElementsByTagName('parsererror')[0];
  if (parseError) throw new Error(`${label} is not valid XML.`);
  return document;
}

function directoryName(path: string) {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index + 1);
}

function normalizePath(path: string) {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join('/');
}

function resolvePath(fromFilePath: string, href: string) {
  const [pathOnly] = href.split(/[?#]/, 1);
  if (!pathOnly) return '';
  if (pathOnly.startsWith('/')) return normalizePath(pathOnly.slice(1));
  return normalizePath(`${directoryName(fromFilePath)}${pathOnly}`);
}

function mediaTypeForPath(path: string) {
  const lower = path.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.css')) return 'text/css';
  if (lower.endsWith('.otf')) return 'font/otf';
  if (lower.endsWith('.ttf')) return 'font/ttf';
  if (lower.endsWith('.woff')) return 'font/woff';
  if (lower.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

async function dataUrlForFile(zip: JSZip, fromFilePath: string, href: string) {
  const path = resolvePath(fromFilePath, href);
  const file = path ? zip.file(path) : null;
  if (!file) return undefined;
  const base64 = await file.async('base64');
  return `data:${mediaTypeForPath(path)};base64,${base64}`;
}

async function inlineCssUrls(zip: JSZip, cssPath: string, cssText: string) {
  const matches = Array.from(
    cssText.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g),
  );
  const replacements = await Promise.all(
    matches.map(async match => {
      const href = match[2].trim();
      if (
        !href ||
        href.startsWith('#') ||
        /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)
      ) {
        return undefined;
      }
      const dataUrl = await dataUrlForFile(zip, cssPath, href);
      return [
        match[0],
        dataUrl ? `url("${dataUrl}")` : 'local("Arial")',
      ] as const;
    }),
  );

  let result = cssText;
  for (const replacement of replacements) {
    if (!replacement) continue;
    result = result.replace(replacement[0], replacement[1]);
  }
  return result;
}

function isHtmlManifestItem(item: Element) {
  const mediaType = item.getAttribute('media-type') || '';
  const href = item.getAttribute('href') || '';
  return (
    mediaType === 'application/xhtml+xml' ||
    mediaType === 'text/html' ||
    /\.(xhtml|html?)$/i.test(href)
  );
}

function isNavigationItem(item: Element) {
  const id = item.getAttribute('id') || '';
  const href = item.getAttribute('href') || '';
  const properties = item.getAttribute('properties') || '';
  return (
    /\bnav\b/.test(properties) ||
    /^(?:toc|nav)$/i.test(id) ||
    /(?:^|\/)(?:toc|nav)\.x?html?$/i.test(href)
  );
}

function isRenderableContentItem(item: Element) {
  return isHtmlManifestItem(item) && !isNavigationItem(item);
}

async function buildSrcDoc(zip: JSZip, chapterPath: string, html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');

  document.querySelectorAll('script').forEach(element => element.remove());
  document.querySelectorAll('iframe, object, embed').forEach(element => {
    element.remove();
  });

  const stylesheetLinks = Array.from(
    document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'),
  );
  for (const link of stylesheetLinks) {
    const cssPath = resolvePath(chapterPath, link.getAttribute('href') || '');
    const cssFile = cssPath ? zip.file(cssPath) : null;
    if (!cssFile) continue;
    const style = document.createElement('style');
    style.textContent = await inlineCssUrls(
      zip,
      cssPath,
      await cssFile.async('text'),
    );
    link.replaceWith(style);
  }

  const images = Array.from(document.querySelectorAll<HTMLImageElement>('img'));
  for (const image of images) {
    const src = image.getAttribute('src');
    if (!src || /^[a-z][a-z\d+.-]*:/i.test(src)) continue;
    const dataUrl = await dataUrlForFile(zip, chapterPath, src);
    if (dataUrl) image.setAttribute('src', dataUrl);
  }

  const title = document.querySelector('title')?.textContent || 'EPUB Preview';
  const head = document.head?.innerHTML || '';
  const body = document.body?.innerHTML || html;

  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    '<style>body{margin:24px;font-family:system-ui,sans-serif;line-height:1.65;color:#111827;background:#ffffff;}img{max-width:100%;height:auto;}</style>',
    head,
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('');
}

export async function createEpubPreview(
  resource: Plugin.ChapterBinaryResource,
): Promise<EpubPreviewResult> {
  const zip = await JSZip.loadAsync(resource.bytes);
  const mimetype = await zip.file('mimetype')?.async('text');
  if (mimetype?.trim() !== 'application/epub+zip') {
    throw new Error('EPUB mimetype is missing or invalid.');
  }

  const containerText = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerText) throw new Error('EPUB container.xml is missing.');

  const container = parseXml(containerText, 'EPUB container.xml');
  const rootfile = firstElementByLocalName(container, 'rootfile');
  const packagePath = rootfile?.getAttribute('full-path');
  if (!packagePath) throw new Error('EPUB package path is missing.');

  const packageText = await zip.file(packagePath)?.async('text');
  if (!packageText) throw new Error('EPUB package document is missing.');

  const packageDocument = parseXml(packageText, 'EPUB package document');
  const title =
    firstElementByLocalName(packageDocument, 'title')?.textContent?.trim() ||
    resource.filename ||
    'EPUB Preview';
  const manifestItems = elementsByLocalName(packageDocument, 'item');
  const manifestById = new Map(
    manifestItems
      .map(item => [item.getAttribute('id') || '', item] as const)
      .filter(([id]) => id),
  );
  const spineItem = elementsByLocalName(packageDocument, 'itemref')
    .map(itemref => manifestById.get(itemref.getAttribute('idref') || ''))
    .find(item => item && isRenderableContentItem(item));
  const fallbackItem =
    manifestItems.find(isRenderableContentItem) ||
    manifestItems.find(isHtmlManifestItem);
  const chapterItem = spineItem || fallbackItem;
  const href = chapterItem?.getAttribute('href');
  if (!href) throw new Error('EPUB has no renderable spine item.');

  const chapterPath = resolvePath(packagePath, href);
  const chapterText = await zip.file(chapterPath)?.async('text');
  if (!chapterText) throw new Error('EPUB spine document is missing.');

  return {
    title,
    packagePath,
    chapterPath,
    srcDoc: await buildSrcDoc(zip, chapterPath, chapterText),
  };
}
