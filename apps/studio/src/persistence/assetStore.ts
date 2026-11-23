import { type AssetEntry, type AssetKind, fileTypeFromName, hashBytes } from '@galbe/core';
import { db } from './db.ts';

/**
 * Content-addressed asset storage shared by every project. Storing the same file twice
 * (e.g. the same font in two projects) keeps a single copy.
 */
export async function putAsset(
  bytes: Uint8Array | ArrayBuffer,
  info: { name: string; mime?: string; kind?: AssetKind; meta?: AssetEntry['meta'] },
): Promise<AssetEntry> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const id = await hashBytes(view);
  const type = fileTypeFromName(info.name);
  const mime = info.mime ?? type?.mime ?? 'application/octet-stream';
  const store = await db();
  if (!(await store.getKey('assets', id))) {
    await store.put('assets', {
      id,
      blob: new Blob([view as Uint8Array<ArrayBuffer>], { type: mime }),
      name: info.name,
      mime,
      size: view.byteLength,
      createdAt: new Date().toISOString(),
    });
  }
  return {
    id,
    kind: info.kind ?? type?.kind ?? 'other',
    name: info.name,
    mime,
    size: view.byteLength,
    meta: info.meta ?? {},
  };
}

export async function getAssetBlob(id: string): Promise<Blob | undefined> {
  return (await (await db()).get('assets', id))?.blob;
}

export async function getAssetBytes(id: string): Promise<Uint8Array | undefined> {
  const blob = await getAssetBlob(id);
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}
