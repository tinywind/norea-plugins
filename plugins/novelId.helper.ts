/** Encodes source-owned identity parts as one portable directory component. */
export function sourceNovelId(...parts: string[]): string {
  let novelId = parts
    .map(part =>
      encodeURIComponent(part).replace(/%[0-9A-F]{2}|[A-Z!'()*]/g, token =>
        token.length === 3
          ? token
          : `%${token.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join('+');

  if (!novelId) throw new Error('The source novel ID must not be empty.');
  if (/^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(novelId)) {
    novelId = `%${novelId.charCodeAt(0).toString(16).toUpperCase()}${novelId.slice(1)}`;
  }
  novelId = novelId.replace(
    /^\.|\.$|\.(?=(?:tmp|bak|part|partial|norea-sync-backup)$)/gi,
    '%2E',
  );
  if (novelId.length > 240) {
    throw new Error('The encoded source novel ID must fit within 240 bytes.');
  }
  return novelId;
}
