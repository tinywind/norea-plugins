import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import process from 'node:process';
import { runInNewContext } from 'node:vm';

test('compiled plugins inline shared helpers across language directories', async () => {
  await fs.mkdir('.tmp', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/helper-bundle-'));
  try {
    await fs.mkdir(path.join(root, 'english'));
    await fs.mkdir(path.join(root, 'korean'));
    await fs.writeFile(
      path.join(root, 'novelId.helper.js'),
      "exports.sourceNovelId = value => 'source-' + value;",
    );
    await fs.writeFile(
      path.join(root, 'korean/details.helper.js'),
      "exports.id = require('../novelId.helper').sourceNovelId('456');",
    );
    await fs.writeFile(
      path.join(root, 'english/source.js'),
      "exports.default = require('@plugins/novelId.helper').sourceNovelId('123');",
    );
    await fs.writeFile(
      path.join(root, 'korean/source.js'),
      "exports.default = require('./details.helper').id;",
    );
    const result = spawnSync(
      process.execPath,
      ['scripts/bundle-plugin-helpers.js', root],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    for (const [language, expected] of [
      ['english', 'source-123'],
      ['korean', 'source-456'],
    ]) {
      const context = {
        exports: {},
        require: () => {
          throw new Error('Unbundled dependency');
        },
      };
      runInNewContext(
        await fs.readFile(path.join(root, language, 'source.js'), 'utf8'),
        context,
      );
      assert.equal(context.exports.default, expected);
    }
    await assert.rejects(fs.access(path.join(root, 'novelId.helper.js')));
    await assert.rejects(
      fs.access(path.join(root, 'korean/details.helper.js')),
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('plugin index generation skips shared helper files in the plugin root', async () => {
  await fs.mkdir('.tmp', { recursive: true });
  const root = await fs.mkdtemp(path.resolve('.tmp/plugin-index-'));
  try {
    await fs.mkdir(path.join(root, 'plugins/english'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'plugins/novelId.helper.ts'),
      'export {};',
    );
    await fs.writeFile(
      path.join(root, 'plugins/english/example.ts'),
      'export default {};',
    );
    const result = spawnSync(
      process.execPath,
      [path.resolve('scripts/generate-plugin-index.js')],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const index = await fs.readFile(
      path.join(root, 'plugins/index.ts'),
      'utf8',
    );
    assert.match(index, /@plugins\/english\/example/);
    assert.doesNotMatch(index, /novelId\.helper/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
