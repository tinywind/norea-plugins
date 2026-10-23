import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';
import { sourceNovelId } from '../plugins/novelId.helper.ts';

async function withPlugin(path, run) {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });
  const originalFetch = globalThis.fetch;
  try {
    const { default: plugin } = await server.ssrLoadModule(path);
    await run(plugin);
  } finally {
    globalThis.fetch = originalFetch;
    await server.close();
  }
}

function assertNovelIdentity(novel, expectedId) {
  assert.equal(novel.novelId, expectedId);
  assert.ok(novel.novelId.length <= 240);
  assert.doesNotMatch(novel.novelId, /[<>:"/\\|?*]/);
  assert.ok(
    Array.from(novel.novelId).every(
      character =>
        character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    ),
  );
  assert.doesNotMatch(
    novel.novelId,
    /^\.|[. ]$|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i,
  );
}

test('source IDs preserve source keys and encode unsafe directory names reversibly', () => {
  for (const [sourceId, expected] of [
    ['123', '123'],
    ['a-source-slug', 'a-source-slug'],
    ['a/b:c\\d?e*f', 'a%2Fb%3Ac%5Cd%3Fe%2Af'],
    ['.hidden', '%2Ehidden'],
    [' name ', '%20name%20'],
    ['name.', 'name%2E'],
    ['CON.txt', '%43%4F%4E.txt'],
    ['con.txt', '%63on.txt'],
    ['Title', '%54itle'],
    ['com0', '%63om0'],
    ['book.partial', 'book%2Epartial'],
    ['book.norea-sync-backup', 'book%2Enorea-sync-backup'],
    ['%2Ehidden', '%252%45hidden'],
  ]) {
    assertNovelIdentity({ novelId: sourceNovelId(sourceId) }, expected);
    assert.equal(decodeURIComponent(expected), sourceId);
  }
  assert.equal(
    sourceNovelId('owner', 'repo', 'a/b', 'c'),
    'owner+repo+a%2Fb+c',
  );
  assert.equal(
    sourceNovelId('owner', 'repo', 'a', 'b/c'),
    'owner+repo+a+b%2Fc',
  );
  assert.notEqual(
    sourceNovelId('book').toLowerCase(),
    sourceNovelId('Book').toLowerCase(),
  );
  assert.equal(sourceNovelId('a+b', 'c'), 'a%2Bb+c');
  assert.equal(sourceNovelId('a', 'b+c'), 'a+b%2Bc');
  assert.equal(sourceNovelId('a'.repeat(240)), 'a'.repeat(240));
  assert.throws(() => sourceNovelId('a'.repeat(241)), /240/);
  assert.throws(() => sourceNovelId(''), /empty/);
  assert.throws(() => sourceNovelId('\ud800'));
});

test('Gutenberg keeps its ebook ID when metadata is unavailable', async () => {
  await withPlugin('/plugins/english/projectgutenberg.ts', async plugin => {
    globalThis.fetch = async () => new globalThis.Response('<feed></feed>');
    const path = 'ebooks/1342.opds';
    assertNovelIdentity(await plugin.parseNovel(path), '1342');
    assertNovelIdentity(await plugin.parseNovelSince(path, 1), '1342');
  });
});

test('Standard Ebooks distinguishes authors and editions of the same title', async () => {
  await withPlugin('/plugins/english/standardebooks.ts', async plugin => {
    globalThis.fetch = async () => new globalThis.Response('<html></html>');
    for (const [path, expected] of [
      [
        'ebooks/jane-austen/pride-and-prejudice',
        'jane-austen%2Fpride-and-prejudice',
      ],
      [
        'ebooks/another-author/pride-and-prejudice',
        'another-author%2Fpride-and-prejudice',
      ],
      [
        'ebooks/jane-austen/pride-and-prejudice/illustrator',
        'jane-austen%2Fpride-and-prejudice%2Fillustrator',
      ],
    ]) {
      const novel = await plugin.parseNovel(path);
      assertNovelIdentity(novel, expected);
      assert.equal(novel.path, path);
      assertNovelIdentity(await plugin.parseNovelSince(path, 1), expected);
    }
  });
});

test('Aozora uses the catalog work ID across card URLs and missing records', async () => {
  await withPlugin('/plugins/japanese/aozorabunko.ts', async plugin => {
    plugin.catalog = async () => ({ byId: new Map() });
    const path =
      'book/123:https%3A%2F%2Fwww.aozora.gr.jp%2Fcards%2F1%2Fcard123.html';
    assertNovelIdentity(await plugin.parseNovel(path), '123');
    assertNovelIdentity(await plugin.parseNovelSince('book/123', 1), '123');
  });
});

test('NDL uses the persistent record ID for full and incremental results', async () => {
  await withPlugin(
    '/plugins/japanese/ndlnextdigitallibrary.ts',
    async plugin => {
      plugin.fetchBook = async () => ({ title: 'Manga', ndc: '726.1' });
      plugin.fetchManifest = async () => ({
        metadata: [{ label: 'Access Restrictions', value: 'PDM' }],
        sequences: [
          {
            canvases: [
              {
                images: [
                  {
                    resource: {
                      service: {
                        '@id': 'https://dl.ndl.go.jp/api/iiif/123/R0000001',
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      });
      assertNovelIdentity(await plugin.parseNovel('book/123'), '123');
      assertNovelIdentity(await plugin.parseNovelSince('book/123', 1), '123');
    },
  );
});

test('OAPEN resolves path aliases to the same repository handle', async () => {
  await withPlugin('/plugins/multi/oapen.ts', async plugin => {
    plugin.fetchItem = async () => ({
      uuid: 'a1b2c3',
      handle: '20.500.12657/123',
      name: 'Open book',
      metadata: [],
      bitstreams: [],
    });
    for (const path of ['handle/20.500.12657/123', 'item/a1b2c3']) {
      assertNovelIdentity(await plugin.parseNovel(path), '20.500.12657%2F123');
      assertNovelIdentity(
        await plugin.parseNovelSince(path, 1),
        '20.500.12657%2F123',
      );
    }
  });
});

test('GitHub work identity ignores snapshots and distinguishes refs and roots', async () => {
  await withPlugin('/plugins/multi/githubdocs.ts', async plugin => {
    plugin.ensureConfiguredRepo = () => undefined;
    plugin.refreshWorkPayload = async payload => payload;
    plugin.pickChapters = async () => [];
    for (const [ref, rootPath, expected] of [
      ['main', 'docs/novel', 'tinywind+norea+main+docs%2Fnovel'],
      ['feature/docs', 'novel', 'tinywind+norea+feature%2Fdocs+novel'],
      ['feature', 'docs/novel', 'tinywind+norea+feature+docs%2Fnovel'],
    ]) {
      for (const treeSha of ['first-snapshot', 'second-snapshot']) {
        const payload = {
          owner: 'tinywind',
          repo: 'norea',
          ref,
          rootPath,
          treeSha,
          title: 'Book',
          private: false,
        };
        const path = `githubdocs-novel:${encodeURIComponent(JSON.stringify(payload))}`;
        assertNovelIdentity(await plugin.parseNovel(path), expected);
        assertNovelIdentity(await plugin.parseNovelSince(path, 1), expected);
      }
    }
  });
});

test('PepperCarrot keeps separate language editions', async () => {
  await withPlugin('/plugins/multi/peppercarrot.ts', async plugin => {
    plugin.episodes = async () => [
      {
        name: 'ep01_Potion-of-Flight',
        number: 1,
        totalPages: 1,
        translatedLanguages: ['en', 'fr'],
      },
    ];
    for (const language of ['en', 'fr']) {
      assertNovelIdentity(
        await plugin.parseNovel(`language/${language}`),
        language,
      );
      assertNovelIdentity(
        await plugin.parseNovelSince(`language/${language}`, 1),
        language,
      );
    }
  });
});

test('Komga takes the series ID from the server response', async () => {
  await withPlugin('/plugins/multi/komga.ts', async plugin => {
    plugin.serverUrl = () => 'https://komga.example/';
    plugin.makeRequest = async path =>
      path.includes('/books?')
        ? JSON.stringify({ content: [] })
        : JSON.stringify({
            id: '0A1B2C3D4E5F6',
            name: 'Series',
            metadata: {},
            booksMetadata: {},
          });
    for (const path of [
      'api/v1/series/0A1B2C3D4E5F6',
      '/api/v1/series/0A1B2C3D4E5F6',
    ]) {
      const novel = await plugin.parseNovel(path);
      assertNovelIdentity(novel, '0%411%422%433%444%455%466');
      assert.equal(novel.path, path);
      assertNovelIdentity(
        await plugin.parseNovelSince(path, 1),
        '0%411%422%433%444%455%466',
      );
    }
  });
});

test('the development fixture exposes its stable work ID', async () => {
  await withPlugin('/plugins/dev/contenttypefixture.ts', async plugin => {
    assertNovelIdentity(await plugin.parseNovel(), 'content-types');
    assertNovelIdentity(await plugin.parseNovelSince(), 'content-types');
  });
});
