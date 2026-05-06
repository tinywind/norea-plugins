# Quick start

1. [Requirements](#requirements)
2. [Single plugin guide](#guide)
3. [Multi-src guide](#creating-multi-src-plugins)

### Requirements

- [git](https://git-scm.com/doc/ext) basics
- TypeScript or JavaScript basics
- Node >=18
- Dependencies installed with `npm i`
- The canonical [LNReaderTauri plugin contract](https://github.com/tinywind/lnreader-tauri/blob/main/docs/plugins/contract.md) for supported runtime APIs and sandbox rules

### Guide

1. Create plugin script in `/plugins` [<span style="font-size: 0.8rem;">(learn more)</span>](#creating-plugin-script)
2. Copy code from [plugin-template.ts](./plugin-template.ts)
3. Start coding [<span style="font-size:0.8rem">(documentation)</span>](./docs.md)

#### Creating plugin script

1. Remember to create your plugin inside the language folder corresponding to the language of the novels
2. File should have the `.ts` extension
   Example `plugins/english/nobleMTL.ts`
3. Add an icon under `public/static/src/<lang>/<plugin-id>/icon.png`
4. Set the plugin's `icon` field to the same path without the `public/static/` prefix

> [!WARNING]
> Icon size should be 96x96px!

Example:

```ts
icon = 'src/english/example/icon.png';
```

### Creating multi-source plugins

Use the `multi` folder for plugins that are language-agnostic, self-hosted, or
catalog sources that are not tied to one novel language.

```text
plugins/multi/example.ts
public/static/src/multi/example/icon.png
```

Multi-source plugins still follow the same `Plugin.PluginBase` contract and
must return `path` fields, not `url` fields.
