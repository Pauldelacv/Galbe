import { ASSET_URI_PATTERN, type AssetUri } from './schema/common.ts';
import type { AssetKind } from './schema/document.ts';

export type ParsedAssetUri = { scheme: 'builtin'; id: string } | { scheme: 'asset'; id: string };

export function parseAssetUri(uri: string): ParsedAssetUri | null {
  if (!ASSET_URI_PATTERN.test(uri)) return null;
  const index = uri.indexOf(':');
  const scheme = uri.slice(0, index);
  const id = uri.slice(index + 1);
  return scheme === 'builtin' ? { scheme, id } : { scheme: 'asset', id };
}

export const isAssetUri = (value: unknown): value is AssetUri =>
  typeof value === 'string' && ASSET_URI_PATTERN.test(value);

export const builtinUri = (id: string): AssetUri => `builtin:${id}`;
export const projectAssetUri = (id: string): AssetUri => `asset:${id}`;

/** Content hash used as project asset id: first 128 bits of SHA-256, lowercase hex. */
export async function hashBytes(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest).subarray(0, 16), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/**
 * Every asset URI referenced anywhere in a JSON-like value. Walking the whole tree (rather
 * than listing known fields) keeps this correct as new asset-bearing fields are added.
 */
export function collectAssetUris(value: unknown, into = new Set<AssetUri>()): Set<AssetUri> {
  if (typeof value === 'string') {
    if (isAssetUri(value)) into.add(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectAssetUris(item, into);
  } else if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) collectAssetUris(item, into);
  }
  return into;
}

/** Project asset ids (not builtins) referenced by a value. */
export function collectProjectAssetIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  for (const uri of collectAssetUris(value)) {
    const parsed = parseAssetUri(uri);
    if (parsed?.scheme === 'asset') ids.add(parsed.id);
  }
  return ids;
}

interface FileType {
  ext: string;
  mime: string;
  kind: AssetKind;
}

const FILE_TYPES: FileType[] = [
  { ext: 'ttf', mime: 'font/ttf', kind: 'font' },
  { ext: 'otf', mime: 'font/otf', kind: 'font' },
  { ext: 'woff', mime: 'font/woff', kind: 'font' },
  { ext: 'woff2', mime: 'font/woff2', kind: 'font' },
  { ext: 'hdr', mime: 'image/vnd.radiance', kind: 'hdri' },
  { ext: 'exr', mime: 'image/x-exr', kind: 'hdri' },
  { ext: 'png', mime: 'image/png', kind: 'image' },
  { ext: 'jpg', mime: 'image/jpeg', kind: 'image' },
  { ext: 'jpeg', mime: 'image/jpeg', kind: 'image' },
  { ext: 'webp', mime: 'image/webp', kind: 'image' },
  { ext: 'avif', mime: 'image/avif', kind: 'image' },
  { ext: 'svg', mime: 'image/svg+xml', kind: 'svg' },
  { ext: 'mp4', mime: 'video/mp4', kind: 'video' },
  { ext: 'webm', mime: 'video/webm', kind: 'video' },
  { ext: 'mov', mime: 'video/quicktime', kind: 'video' },
  { ext: 'glb', mime: 'model/gltf-binary', kind: 'model' },
  { ext: 'gltf', mime: 'model/gltf+json', kind: 'model' },
  { ext: 'fbx', mime: 'application/octet-stream', kind: 'model' },
  { ext: 'obj', mime: 'model/obj', kind: 'model' },
];

export const extensionOf = (name: string): string => {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
};

export function fileTypeFromName(name: string): FileType | undefined {
  const ext = extensionOf(name);
  return FILE_TYPES.find((type) => type.ext === ext);
}

export function extensionForMime(mime: string): string {
  return FILE_TYPES.find((type) => type.mime === mime)?.ext ?? 'bin';
}

export function mimeForExtension(ext: string): string {
  return (
    FILE_TYPES.find((type) => type.ext === ext.toLowerCase())?.mime ?? 'application/octet-stream'
  );
}
