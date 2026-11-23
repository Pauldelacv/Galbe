import { strFromU8, strToU8, type Unzipped, unzipSync, type Zippable, zipSync } from 'fflate';
import { collectProjectAssetIds, extensionForMime, hashBytes } from './assets.ts';
import { GalbeDocumentError, type LoadOptions, loadDocument } from './migrations.ts';
import type { AssetEntry, GalbeDocument } from './schema/document.ts';

export const GALBE_EXTENSION = 'galbe';
export const GALBE_MIME = 'application/vnd.galbe+zip';
const SCENE_PATH = 'scene.json';
const THUMBNAIL_PATH = 'thumbnail.png';
const ASSET_DIR = 'assets/';

/** Formats that are already compressed; storing them avoids wasting CPU on deflate. */
const STORED_MIME = /^(image\/(png|jpeg|webp|avif)|video\/|font\/woff2?|model\/gltf-binary)/;

export interface AssetBytes {
  bytes: Uint8Array;
  mime: string;
}

export interface PackInput {
  document: GalbeDocument;
  /** Returns the bytes of a project asset referenced by the document. */
  getAsset: (id: string) => Promise<Uint8Array | undefined> | Uint8Array | undefined;
  thumbnail?: Uint8Array;
}

/**
 * Builds a `.galbe` zip. Only assets actually referenced by the document are written,
 * and `document.assets` is pruned accordingly, so files never carry dead weight.
 */
export async function packGalbe({ document, getAsset, thumbnail }: PackInput): Promise<Uint8Array> {
  const used = collectProjectAssetIds(document);
  const assets: Record<string, AssetEntry> = {};
  const files: Zippable = {};

  for (const id of used) {
    const entry = document.assets[id];
    if (!entry) throw new GalbeDocumentError(`Asset "${id}" is referenced but has no metadata.`);
    const bytes = await getAsset(id);
    if (!bytes) throw new GalbeDocumentError(`Asset "${id}" (${entry.name}) is missing.`);
    assets[id] = entry;
    files[`${ASSET_DIR}${id}.${extensionForMime(entry.mime)}`] = [
      bytes,
      { level: STORED_MIME.test(entry.mime) ? 0 : 6 },
    ];
  }

  const scene: GalbeDocument = { ...document, assets };
  files[SCENE_PATH] = [strToU8(JSON.stringify(scene, null, 2)), { level: 9 }];
  if (thumbnail) files[THUMBNAIL_PATH] = [thumbnail, { level: 0 }];
  return zipSync(files, { mtime: new Date(document.updatedAt) });
}

export interface UnpackedGalbe {
  document: GalbeDocument;
  assets: Map<string, AssetBytes>;
  thumbnail?: Uint8Array;
  /** Non-fatal problems (e.g. an asset whose content does not match its id). */
  warnings: string[];
}

export async function unpackGalbe(
  bytes: Uint8Array,
  options: LoadOptions = {},
): Promise<UnpackedGalbe> {
  let entries: Unzipped;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new GalbeDocumentError('This file is not a valid .galbe archive.');
  }
  const sceneBytes = entries[SCENE_PATH];
  if (!sceneBytes) throw new GalbeDocumentError('This .galbe archive has no scene.json.');

  let json: unknown;
  try {
    json = JSON.parse(strFromU8(sceneBytes));
  } catch {
    throw new GalbeDocumentError('scene.json is not valid JSON.');
  }
  const document = loadDocument(json, options);

  const warnings: string[] = [];
  const assets = new Map<string, AssetBytes>();
  const byId = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (!path.startsWith(ASSET_DIR)) continue;
    const name = path.slice(ASSET_DIR.length);
    const id = name.split('.')[0] ?? '';
    byId.set(id, data);
  }
  for (const id of collectProjectAssetIds(document)) {
    const entry = document.assets[id];
    const data = byId.get(id);
    if (!entry || !data)
      throw new GalbeDocumentError(`Asset "${entry?.name ?? id}" is missing from the archive.`);
    if ((await hashBytes(data)) !== id)
      warnings.push(`Asset "${entry.name}" does not match its checksum.`);
    assets.set(id, { bytes: data, mime: entry.mime });
  }
  const thumbnail = entries[THUMBNAIL_PATH];
  return { document, assets, warnings, ...(thumbnail ? { thumbnail } : {}) };
}

/** Quick sniff: zip local file header magic. */
export const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes.length > 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  bytes[2] === 0x03 &&
  bytes[3] === 0x04;
