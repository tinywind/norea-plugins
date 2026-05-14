type ZipInput = ArrayBuffer | Uint8Array | number[];
type ZipEntry = {
  name: string;
  dir: boolean;
  async(type: 'uint8array'): Promise<Uint8Array>;
};
type ZipArchive = {
  files: Record<string, ZipEntry>;
  file(path: string): ZipEntry | null;
};

export type ZipEntryInfo = {
  name: string;
  compressedSize?: number;
  uncompressedSize?: number;
};

export type ZipReadOptions = {
  path?: string;
  extension?: string;
  encoding?: string;
  maxBytes?: number;
};

const toUint8Array = (input: ZipInput) =>
  input instanceof Uint8Array ? input : new Uint8Array(input);

const normalizeExtension = (extension?: string) =>
  extension ? extension.replace(/^\./, '').toLowerCase() : undefined;

async function loadZip(input: ZipInput): Promise<ZipArchive> {
  const { default: JSZip } = await import('jszip');
  return JSZip.loadAsync(toUint8Array(input));
}

const findEntry = (zip: ZipArchive, options: ZipReadOptions) => {
  if (options.path) {
    const file = zip.file(options.path);
    if (file) return file;
  }

  const extension = normalizeExtension(options.extension);
  const files = Object.values(zip.files).filter(file => !file.dir);
  return extension
    ? files.find(file => file.name.toLowerCase().endsWith(`.${extension}`))
    : files[0];
};

export async function listZipEntries(input: ZipInput): Promise<ZipEntryInfo[]> {
  const zip = await loadZip(input);
  return Object.values(zip.files).map(file => ({
    name: file.name,
    compressedSize: undefined,
    uncompressedSize: undefined,
  }));
}

export async function readZipFile(
  input: ZipInput,
  options: ZipReadOptions = {},
): Promise<Uint8Array> {
  const zip = await loadZip(input);
  const entry = findEntry(zip, options);
  if (!entry) {
    throw new Error('Zip entry not found');
  }

  const bytes = await entry.async('uint8array');
  if (options.maxBytes !== undefined && bytes.byteLength > options.maxBytes) {
    throw new Error('Zip entry exceeds maxBytes');
  }
  return bytes;
}

export async function readZipText(
  input: ZipInput,
  options: ZipReadOptions = {},
): Promise<string> {
  const bytes = await readZipFile(input, options);
  return new TextDecoder(options.encoding ?? 'utf-8').decode(bytes);
}
