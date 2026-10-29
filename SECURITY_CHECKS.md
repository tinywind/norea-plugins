# EPUB security checks

`npm run test:epub` creates real EPUB ZIP files with the public `createEpub`
function. It verifies malformed script/style closing tags, event handlers,
JavaScript links, quoted image attributes, missing and existing alt text, retained
inline formatting, binary attachment bytes, escaped metadata, and UUID format.
An XML parser verifies that chapter output retains well-formed XHTML, including
`br` and `img` elements. Serialization uses the browser's XMLSerializer on an
inert template so image nodes do not start requests during export.
The old regular expressions fail the executable-markup and image-attribute cases.

EPUB export is called from the React browser host in `src/hooks/useEpubExport.ts`.
DOMPurify uses that host's DOM. This exporter is not a DOM-less worker API.
DOMPurify removes style elements while preserving inline styles; UUID generation
uses `crypto.getRandomValues`, which is also available in ordinary HTTP contexts.

Run `npm ci`, `npm run test:novel-identity`, `npm run test:epub`,
`npm run typecheck`, `npm run lint`, `npm run build:full`, and `npm audit`.
The existing lint warnings in fetch/storage helpers are outside this change.

The manifest builder reads and writes the fixed local build output
`.dist/plugins.json` and `.dist/plugins.min.json`. Its existence check selects
whether `--only-new` reads a prior build; it does not authorize an HTTP-selected
filesystem path. Build from a trusted checkout and keep the output directory
writable only by trusted operators. Plugin source evaluation in that build is
limited to the trusted checkout; the script does not download source code.

TypeScript 7 is incompatible with typescript-eslint 8.72.1's declared
`>=4.8.4 <6.1.0` peer range. A clean install of the proposed TypeScript 7 lockfile
fails with `ERESOLVE`; the supported toolchain retains TypeScript 6.0.3.
Dependabot ignores only the TypeScript 7 series. Its default cooldown remains
enabled; a successful local install is not a successful Dependabot update job.
