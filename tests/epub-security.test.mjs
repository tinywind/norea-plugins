import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import JSZip from 'jszip';

const host = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = host.window;
globalThis.document = host.window.document;
const { createEpub } = await import('../src/lib/epub.ts');

async function epub(content, options = {}, binaryResource) {
  const blob = await createEpub(
    [{ title: 'Chapter <one>', path: '/one', content, binaryResource }],
    { title: 'Book & title', author: 'Author <name>', ...options },
  );
  const zip = await JSZip.loadAsync(new Uint8Array(await blob.arrayBuffer()));
  const chapter = await zip.file('OEBPS/chapter1.xhtml').async('string');
  const parsed = new JSDOM(chapter);
  return { zip, chapter, body: parsed.window.document.body };
}

test('EPUB chapter HTML removes executable markup and malformed closing tags', async () => {
  const { body, chapter } = await epub(`
    <p style="color: blue"><em>Kept formatting</em></p>
    <script>globalThis.epubAttack = 1</script\t>
    <style>.epub-attack { display: none }</style\t>
    <img src="image.png" onerror="globalThis.epubAttack = 2">
    <a href="java&#10;script:alert(1)">Readable link</a>
    <svg><g onload="globalThis.epubAttack = 3"></g></svg>
  `);
  assert.equal(body.querySelector('script, style'), null);
  for (const element of body.querySelectorAll('*')) {
    for (const attribute of element.attributes) {
      assert.doesNotMatch(attribute.name, /^on/i);
      if (['href', 'src', 'xlink:href'].includes(attribute.name)) {
        assert.doesNotMatch(
          attribute.value.replace(/\s/g, ''),
          /^javascript:/i,
        );
      }
    }
  }
  assert.equal(body.querySelector('p em').textContent, 'Kept formatting');
  assert.match(body.querySelector('p').getAttribute('style'), /color:\s*blue/);
  assert.ok(body.textContent.includes('Readable link'));
  assert.doesNotMatch(chapter, /epub-attack/);
});

test('EPUB image normalization preserves quoted attributes and existing alt text', async () => {
  const { body } = await epub(
    '<img title="a > b" data-example="alt=" src="one.png"><img src="two.png" alt="Kept caption">',
  );
  const images = body.querySelectorAll('img');
  assert.equal(images.length, 2);
  assert.equal(images[0].getAttribute('title'), 'a > b');
  assert.equal(images[0].getAttribute('alt'), '');
  assert.equal(images[1].getAttribute('alt'), 'Kept caption');
});

test('EPUB chapter output remains well-formed XHTML with void elements', async () => {
  const { chapter } = await epub(
    '<p>Line break<br/><img src="one.png" alt="Kept caption" /></p>',
  );
  const parsed = new JSDOM(chapter, { contentType: 'application/xhtml+xml' });
  assert.equal(parsed.window.document.querySelectorAll('br').length, 1);
  assert.equal(
    parsed.window.document.querySelector('img').getAttribute('alt'),
    'Kept caption',
  );
});

test('EPUB ZIP preserves binary attachments, escaped metadata and UUID identifiers', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 0, 255]);
  const { zip, body } = await epub(
    '<strong>Attached chapter</strong>',
    {},
    {
      contentType: 'pdf',
      filename: '../A & book.pdf',
      bytes,
    },
  );
  const attachment = zip.file('OEBPS/resources/resource-1-A___book.pdf');
  assert.ok(attachment);
  assert.deepEqual(await attachment.async('uint8array'), bytes);
  assert.equal(body.querySelector('h1').textContent, 'Chapter <one>');
  assert.equal(
    body.querySelector('a').getAttribute('href'),
    'resources/resource-1-A___book.pdf',
  );
  const metadata = await zip.file('OEBPS/content.opf').async('string');
  assert.match(metadata, /Book &amp; title/);
  assert.match(metadata, /Author &lt;name&gt;/);
  assert.match(
    metadata,
    /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/,
  );
  assert.equal(
    await zip.file('mimetype').async('string'),
    'application/epub+zip',
  );
});
