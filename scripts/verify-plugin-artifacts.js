import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import languages from './languages.js';

const DIST_DIR = '.dist';
const COMPILED_PLUGIN_DIR = path.join('.js', 'plugins');
const manifestPath = path.join(DIST_DIR, 'plugins.json');
const minManifestPath = path.join(DIST_DIR, 'plugins.min.json');
const sourceBranch = execSync('git branch --show-current').toString().trim();
const artifactBranch = process.env.BRANCH || `dist/${sourceBranch}`;
if (!sourceBranch && !process.env.BRANCH) {
  throw new Error('BRANCH is required when verifying from a detached HEAD.');
}
if (!artifactBranch.startsWith('dist/')) {
  throw new Error(`Artifact branch must start with dist/: ${artifactBranch}`);
}
const expectedBranchSegment = `/${artifactBranch}/.js/plugins/`;
const chapterPageCaptureArtifacts = [
  'JjaptokiManhwa.js',
  'JjaptokiNovel.js',
  'JjaptokiWebtoon.js',
  'NewtokiManhwa.js',
  'NewtokiNovel.js',
  'NewtokiWebtoon.js',
];
const chapterContentSelector = '[data-norea-chapter-content]';
const novelightChapterSelector =
  '.chapter-text:not(.chapter-text__limit):not(:empty)';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${filePath} does not exist.`);
  }

  const contents = fs.readFileSync(filePath, 'utf-8');
  if (!contents.trim()) {
    throw new Error(`${filePath} is empty.`);
  }

  return JSON.parse(contents);
}

function expectedPlugins() {
  const plugins = [];

  for (const [language, languageLabel] of Object.entries(languages)) {
    const languageDirName = language.toLowerCase();
    const sourceDir = path.join('plugins', languageDirName);

    if (!fs.existsSync(sourceDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      if (
        !entry.isFile() ||
        !entry.name.endsWith('.ts') ||
        entry.name.endsWith('.helper.ts') ||
        entry.name.endsWith('.broken.ts') ||
        entry.name.startsWith('.')
      ) {
        continue;
      }

      const pluginName = entry.name.replace(/\.ts$/, '');
      plugins.push({
        language: languageLabel,
        sourcePath: path.join(sourceDir, entry.name),
        compiledRelativePath: `${languageDirName}/${pluginName}.js`,
        compiledPath: path.join(
          COMPILED_PLUGIN_DIR,
          languageDirName,
          `${pluginName}.js`,
        ),
      });
    }
  }

  return plugins.sort((a, b) =>
    a.compiledRelativePath.localeCompare(b.compiledRelativePath),
  );
}

function relativePluginPathFromUrl(url) {
  const marker = '/.js/plugins/';
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return '';

  return decodeURIComponent(
    url.slice(markerIndex + marker.length).split(/[?#]/)[0],
  );
}

function createRecursiveProxy() {
  const target = {};
  return new Proxy(target, {
    get(current, property) {
      if (property === 'get') return value => value;
      if (!current[property]) current[property] = createRecursiveProxy();
      return current[property];
    },
  });
}

function evaluateCompiledPlugin(compiledPath, resolveRequire) {
  const source = fs.readFileSync(compiledPath, 'utf-8');
  return Function(
    'require',
    'module',
    `const exports = module.exports = {};
    ${source};
    return exports.default`,
  )(resolveRequire ?? (() => createRecursiveProxy()), {});
}

async function capturedChapterImageSources(documentStartScript) {
  class TestElement {
    constructor(tagName) {
      this.tagName = tagName.toUpperCase();
      this.attributes = new Map();
      this.children = [];
      this.parent = null;
      this.shadowRoot = null;
    }

    get textContent() {
      return this.children.map(child => child.textContent).join('');
    }

    set src(value) {
      this.setAttribute('src', value);
    }

    get src() {
      return this.getAttribute('src') ?? '';
    }

    appendChild(child) {
      child.parent = this;
      this.children.push(child);
      return child;
    }

    attachShadow() {
      return new TestElement('shadow-root');
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    matches(selector) {
      if (selector === '*') return true;
      if (selector === 'img') return this.tagName === 'IMG';
      if (selector === '[data-norea-chapter-content]') {
        return this.attributes.has('data-norea-chapter-content');
      }
      if (selector === '[data-norea-manual-action]') {
        return this.attributes.has('data-norea-manual-action');
      }
      return false;
    }

    querySelector(selector) {
      return this.querySelectorAll(selector)[0] ?? null;
    }

    querySelectorAll(selector) {
      const matches = [];
      for (const child of this.children) {
        if (child.matches(selector)) matches.push(child);
        matches.push(...child.querySelectorAll(selector));
      }
      return matches;
    }

    remove() {
      if (!this.parent) return;
      this.parent.children = this.parent.children.filter(
        child => child !== this,
      );
      this.parent = null;
    }

    replaceChildren(...children) {
      this.children = [];
      for (const child of children) this.appendChild(child);
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  }

  class TestResponse {
    constructor(url, payload) {
      this.url = url;
      this.ok = true;
      this.payload = payload;
    }

    json() {
      return Promise.resolve(this.payload);
    }

    text() {
      return Promise.resolve(JSON.stringify(this.payload));
    }
  }

  const body = new TestElement('body');
  const document = {
    body,
    readyState: 'complete',
    addEventListener: () => undefined,
    createElement: tagName => new TestElement(tagName),
    querySelector: selector => body.querySelector(selector),
    querySelectorAll: selector => body.querySelectorAll(selector),
  };

  Function(
    'document',
    'Element',
    'Response',
    'setTimeout',
    documentStartScript,
  )(document, TestElement, TestResponse, () => undefined);

  const f1Candidate =
    'https://f1spard.site/candidate/page.js?accessKey=candidate%2Ftoken#page-1';
  await new TestResponse('https://source.test/api/webtoon-images', {
    ok: true,
    images: [
      {
        src: 'https://shaomoi.org/primary/page.js?accessKey=primary#page-1',
        srcCandidates: [
          'https://xiaomichina.com/candidate/page.js?accessKey=second',
          f1Candidate,
        ],
      },
      {
        src: 'https://xiaomichina.com/fallback/page.css?token=signed%2Bvalue#page-2',
      },
      {
        src: 'https://cdn.example/page.jpg?token=unchanged#page-3',
      },
      {
        src: 'https://shaomoi.org/primary/page.json?token=primary#page-4',
        shuffledSrc:
          'https://f1spard.site/shuffled/page.json?token=shuffled#page-4',
      },
    ],
  }).json();
  await Promise.resolve();

  const root = document.querySelector('[data-norea-chapter-content]');
  const images = root?.querySelectorAll('img') ?? [];
  return {
    dataSources: images.map(image => image.getAttribute('data-src') ?? ''),
    expected: [
      f1Candidate,
      'https://f1spard.site/fallback/page.css?token=signed%2Bvalue#page-2',
      'https://cdn.example/page.jpg?token=unchanged#page-3',
      'https://f1spard.site/shuffled/page.json?token=shuffled#page-4',
    ],
    sources: images.map(image => image.getAttribute('src') ?? ''),
  };
}

function fail(errors) {
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const errors = [];
const manifest = readJson(manifestPath);
const minManifest = readJson(minManifestPath);

if (!Array.isArray(manifest)) {
  errors.push(`${manifestPath} must be a JSON array.`);
}

if (!Array.isArray(minManifest)) {
  errors.push(`${minManifestPath} must be a JSON array.`);
}

if (JSON.stringify(manifest) !== JSON.stringify(minManifest)) {
  errors.push(
    `${manifestPath} and ${minManifestPath} contain different plugin data.`,
  );
}

const expected = expectedPlugins();
const manifestByRelativePath = new Map();
const manifestIds = new Set();
const duplicateIds = new Set();

for (const plugin of minManifest) {
  if (!plugin || typeof plugin !== 'object') {
    errors.push('plugins.min.json contains a non-object plugin entry.');
    continue;
  }

  if (!plugin.id) {
    errors.push('plugins.min.json contains a plugin without an id.');
  } else if (manifestIds.has(plugin.id)) {
    duplicateIds.add(plugin.id);
  } else {
    manifestIds.add(plugin.id);
  }

  if (typeof plugin.url !== 'string' || !plugin.url) {
    errors.push(`Plugin ${plugin.id || '<unknown>'} does not have a url.`);
    continue;
  }

  if (!plugin.url.includes(expectedBranchSegment)) {
    errors.push(
      `Plugin ${plugin.id || '<unknown>'} url must point at ${expectedBranchSegment}.`,
    );
  }

  const relativePath = relativePluginPathFromUrl(plugin.url);
  if (!relativePath) {
    errors.push(
      `Plugin ${plugin.id || '<unknown>'} url does not point at .js/plugins.`,
    );
    continue;
  }

  if (manifestByRelativePath.has(relativePath)) {
    errors.push(`Multiple manifest entries point at ${relativePath}.`);
  }

  manifestByRelativePath.set(relativePath, plugin);
}

for (const id of duplicateIds) {
  errors.push(`Duplicate plugin id in plugins.min.json: ${id}.`);
}

for (const plugin of expected) {
  if (!fs.existsSync(plugin.compiledPath)) {
    errors.push(
      `${plugin.sourcePath} did not compile to ${plugin.compiledPath}.`,
    );
    continue;
  }

  const stats = fs.statSync(plugin.compiledPath);
  if (!stats.isFile() || stats.size === 0) {
    errors.push(`${plugin.compiledPath} is empty or is not a file.`);
  }

  const manifestEntry = manifestByRelativePath.get(plugin.compiledRelativePath);
  if (!manifestEntry) {
    errors.push(`plugins.min.json is missing ${plugin.compiledRelativePath}.`);
    continue;
  }

  if (manifestEntry.lang !== plugin.language) {
    errors.push(
      `${manifestEntry.id} has lang '${manifestEntry.lang}', expected '${plugin.language}'.`,
    );
  }
}

for (const relativePath of manifestByRelativePath.keys()) {
  const compiledPath = path.join(COMPILED_PLUGIN_DIR, relativePath);
  if (!fs.existsSync(compiledPath)) {
    errors.push(`plugins.min.json points at missing file ${compiledPath}.`);
  }
}

for (const artifactName of chapterPageCaptureArtifacts) {
  const compiledPath = path.join(COMPILED_PLUGIN_DIR, 'korean', artifactName);
  if (!fs.existsSync(compiledPath)) continue;

  try {
    const plugin = evaluateCompiledPlugin(compiledPath);
    const plan = plugin.getChapterAcquisitionPlan('/novel/1/1', 'html');
    const pluginName = artifactName.replace(/\.js$/, '');

    if (plan?.type !== 'page') {
      errors.push(`${pluginName} chapter acquisition must use a page plan.`);
      continue;
    }
    if (plan.contentSelector !== chapterContentSelector) {
      errors.push(
        `${pluginName} contentSelector must be '${chapterContentSelector}'.`,
      );
    }
    if (plan.readySelector !== chapterContentSelector) {
      errors.push(
        `${pluginName} readySelector must be '${chapterContentSelector}'.`,
      );
    }
    if (plan.loadStrategy !== 'selector') {
      errors.push(`${pluginName} loadStrategy must be 'selector'.`);
    }
    const capturedImages = await capturedChapterImageSources(
      plan.documentStartScript,
    );
    if (
      JSON.stringify(capturedImages.dataSources) !==
        JSON.stringify(capturedImages.expected) ||
      capturedImages.sources.some(Boolean)
    ) {
      errors.push(
        `${pluginName} must keep normalized capture URLs in data-src without starting eager image requests through src.`,
      );
    }
  } catch (error) {
    errors.push(
      `${artifactName} chapter acquisition plan failed: ${String(error)}`,
    );
  }
}

const novelightArtifactPath = path.join(
  COMPILED_PLUGIN_DIR,
  'english',
  'novelight.js',
);
if (fs.existsSync(novelightArtifactPath)) {
  try {
    const plugin = evaluateCompiledPlugin(novelightArtifactPath);
    const chapterPath = 'book/chapter/150473';
    const plan = plugin.getChapterAcquisitionPlan(chapterPath, 'html');

    if (plan?.type !== 'page') {
      errors.push('Novelight chapter acquisition must use a page plan.');
    } else {
      if (plan.url !== `https://novelight.net/${chapterPath}`) {
        errors.push('Novelight page plan must resolve the chapter URL.');
      }
      if (plan.contentSelector !== novelightChapterSelector) {
        errors.push(
          `Novelight contentSelector must be '${novelightChapterSelector}'.`,
        );
      }
      if (plan.readySelector !== novelightChapterSelector) {
        errors.push(
          `Novelight readySelector must be '${novelightChapterSelector}'.`,
        );
      }
      if (plan.loadStrategy !== 'selector') {
        errors.push("Novelight loadStrategy must be 'selector'.");
      }
      if (!plan.excludeSelectors?.includes('.advertisment')) {
        errors.push('Novelight must exclude chapter advertisements.');
      }
    }
    if (typeof plugin.getChapterResource === 'function') {
      errors.push('Novelight must not fetch chapter pages as resources.');
    }
  } catch (error) {
    errors.push(`Novelight chapter acquisition plan failed: ${String(error)}`);
  }
}

const fixtureArtifactPath = path.join(
  COMPILED_PLUGIN_DIR,
  'dev',
  'contenttypefixture.js',
);
if (fs.existsSync(fixtureArtifactPath)) {
  const fixtureStatus = 503;
  const fixtureRequire = moduleId => {
    if (moduleId === '@libs/fetch') {
      return {
        fetchApi: async () => ({ ok: false, status: fixtureStatus }),
      };
    }
    if (moduleId === '@libs/pluginInputs') {
      return { inputs: { get: () => undefined } };
    }
    return createRecursiveProxy();
  };

  try {
    const fixture = evaluateCompiledPlugin(fixtureArtifactPath, fixtureRequire);
    await fixture.getChapterResource(
      'https://fixture.test/static/fixtures/content-types/chapters/pdf/chapter-1.pdf',
      'pdf',
    );
    errors.push('Content type fixture must reject a non-2xx PDF response.');
  } catch (error) {
    if (!String(error).includes(`HTTP ${fixtureStatus}`)) {
      errors.push(
        `Content type fixture returned the wrong PDF error: ${String(error)}`,
      );
    }
  }
} else {
  errors.push(`${fixtureArtifactPath} does not exist.`);
}

const fixturePdfPath =
  'public/static/fixtures/content-types/chapters/pdf/chapter-1.pdf';
try {
  const pdf = fs.readFileSync(fixturePdfPath).toString('latin1');
  const xrefOffset = Number(pdf.match(/startxref\s+(\d+)/)?.[1]);
  if (!Number.isInteger(xrefOffset) || !pdf.startsWith('xref\n', xrefOffset)) {
    throw new Error('startxref does not point to the cross-reference table.');
  }
  const table = pdf
    .slice(xrefOffset)
    .match(/^xref\n0 (\d+)\n([\s\S]*?)trailer/);
  if (!table) throw new Error('Missing fixture cross-reference entries.');
  const entries = table[2].trimEnd().split('\n');
  if (entries.length !== Number(table[1])) {
    throw new Error('Cross-reference entry count does not match.');
  }
  for (let objectId = 1; objectId < entries.length; objectId += 1) {
    const offset = Number(entries[objectId].slice(0, 10));
    if (!pdf.startsWith(`${objectId} 0 obj\n`, offset)) {
      throw new Error(
        `Cross-reference offset for object ${objectId} is invalid.`,
      );
    }
  }
  const stream = pdf.match(/\/Length (\d+) >>\nstream\n([\s\S]*?)endstream/);
  if (!stream || Number(stream[1]) !== stream[2].length) {
    throw new Error('Fixture content stream length does not match its bytes.');
  }
} catch (error) {
  errors.push(`Invalid PDF smoke fixture: ${String(error)}`);
}

if (errors.length > 0) {
  fail(errors);
}

console.log(
  `Verified ${expected.length} plugin JavaScript files and ${minManifest.length} manifest entries.`,
);
console.log(
  `Verified ${chapterPageCaptureArtifacts.length + 1} selector-based chapter page plans and the fixture PDF error path.`,
);
