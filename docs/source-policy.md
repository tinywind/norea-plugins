# Source Policy

This repository is intentionally conservative because LNReaderTauri may expose plugins and screenshots in public release materials.

## Allowed by default

- Public-domain text sources with clear terms, such as Standard Ebooks or Project Gutenberg.
- Open-license sources when the plugin can preserve attribution and license requirements.
- Official APIs that explicitly allow third-party clients.
- User-owned self-hosted sources, such as Komga, where the repository does not ship copyrighted sample content.
- Project Gutenberg plugins must use OPDS or catalog metadata for discovery instead of scraping ebook landing pages.
- Aozora Bunko plugins must filter out records whose work copyright flag is not clear.
- OAPEN plugins must use the official REST API or metadata feeds and surface source license information.

## Requires review before merge

- User-generated fiction platforms where authors retain copyright.
- Publisher or licensed-translation platforms.
- Sites that allow free reading but restrict automated access, scraping, redistribution, or commercial use.
- Sources whose legal status depends on the user's country.

## Not allowed

- Mirror sites that republish novels, manga, manhwa, or translations without clear authorization.
- Sites already removed from a plugin repository after an owner request.
- Plugins that bypass paywalls, login gates, download limits, DRM, or regional restrictions.
- Demo screenshots or fixtures containing copyrighted novel text or cover art without permission.

## Required evidence for new source plugins

Every source plugin PR must include:

1. The official source URL.
2. The terms, license, copyright, or API policy URL.
3. A short explanation of why the source is acceptable.
4. Any limitations, such as United States-only public-domain status.
5. Confirmation that screenshots and tests do not use unauthorized copyrighted content.

If the evidence is unclear, do not include the plugin by default.
