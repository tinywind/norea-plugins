import fs from 'fs';
import path from 'path';
import languages from './languages.js';

const DIST_DIR = '.dist';
const COMPILED_PLUGIN_DIR = path.join('.js', 'plugins');
const manifestPath = path.join(DIST_DIR, 'plugins.json');
const minManifestPath = path.join(DIST_DIR, 'plugins.min.json');
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
const expectedBranchSegment = `/plugins/v${packageJson.version}/.js/plugins/`;

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

if (errors.length > 0) {
  fail(errors);
}

console.log(
  `Verified ${expected.length} plugin JavaScript files and ${minManifest.length} manifest entries.`,
);
