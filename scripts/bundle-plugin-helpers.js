import fs from 'fs';
import path from 'path';

const pluginDirectory = path.resolve(process.argv[2] || '.js/plugins');
const compiledFiles = fs
  .readdirSync(pluginDirectory, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
  .map(entry => path.join(entry.parentPath, entry.name));
const helpers = new Map(
  compiledFiles
    .filter(file => file.endsWith('.helper.js'))
    .map((file, index) => [
      file,
      {
        source: fs.readFileSync(file, 'utf-8'),
        exportsName: `__noreaPluginHelper${index}`,
      },
    ]),
);

function bundleHelpers(pluginPath) {
  const loaded = new Set();
  const loading = new Set();
  const loaders = [];

  const inlineRequires = (source, sourcePath) =>
    source.replace(
      /require\((["'])((?:\.|@plugins\/)[^"']*\.helper)\1\)/g,
      (_, quote, modulePath) => {
        const helperPath = modulePath.startsWith('@plugins/')
          ? path.resolve(
              pluginDirectory,
              `${modulePath.slice('@plugins/'.length)}.js`,
            )
          : path.resolve(path.dirname(sourcePath), `${modulePath}.js`);
        const helper = helpers.get(helperPath);
        if (!helper)
          throw new Error(`Compiled plugin helper is missing: ${helperPath}`);
        if (!loaded.has(helperPath)) {
          if (loading.has(helperPath)) {
            throw new Error(`Circular plugin helper dependency: ${helperPath}`);
          }
          loading.add(helperPath);
          const helperSource = inlineRequires(helper.source, helperPath);
          loading.delete(helperPath);
          loaded.add(helperPath);
          loaders.push(`const ${helper.exportsName} = {};
(function (exports) {
${helperSource}
})(${helper.exportsName});`);
        }
        return helper.exportsName;
      },
    );

  const source = inlineRequires(
    fs.readFileSync(pluginPath, 'utf-8'),
    pluginPath,
  );
  return loaders.length ? `${loaders.join('\n')}\n${source}` : null;
}

let bundledPluginCount = 0;
for (const pluginPath of compiledFiles) {
  if (pluginPath.endsWith('.helper.js')) continue;
  const bundledSource = bundleHelpers(pluginPath);
  if (!bundledSource) continue;
  fs.writeFileSync(pluginPath, bundledSource);
  bundledPluginCount += 1;
}

for (const helperPath of helpers.keys()) fs.rmSync(helperPath);
if (bundledPluginCount === 0) {
  throw new Error('No plugin imported the compiled source helpers.');
}
console.log(`Bundled source helpers into ${bundledPluginCount} plugins.`);
