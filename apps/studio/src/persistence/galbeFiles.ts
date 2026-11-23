import {
  createId,
  GALBE_EXTENSION,
  GALBE_MIME,
  type GalbeDocument,
  GalbeDocumentError,
  packGalbe,
  unpackGalbe,
} from '@galbe/core';
import { downloadBlob, slugify } from '../lib/files.ts';
import { getAssetBytes } from './assetStore.ts';
import { db } from './db.ts';
import { projectExists, saveProject } from './projectStore.ts';
import { openDocument } from './session.ts';
import { renderThumbnail } from './thumbnail.ts';

/** Downloads the document as a self-contained `.galbe` file. */
export async function exportGalbeFile(doc: GalbeDocument): Promise<void> {
  const thumbnail = await renderThumbnail(512, 'png');
  const bytes = await packGalbe({
    document: { ...doc, updatedAt: new Date().toISOString() },
    getAsset: getAssetBytes,
    ...(thumbnail ? { thumbnail: new Uint8Array(await thumbnail.arrayBuffer()) } : {}),
  });
  downloadBlob(
    new Blob([bytes as Uint8Array<ArrayBuffer>], { type: GALBE_MIME }),
    `${slugify(doc.name)}.${GALBE_EXTENSION}`,
  );
}

/**
 * Imports a `.galbe` file as a project and opens it. A file whose project already exists
 * locally is imported as a copy rather than overwriting local work.
 */
export async function importGalbeFile(
  file: File,
): Promise<{ document: GalbeDocument; warnings: string[] }> {
  const { document, assets, warnings, thumbnail } = await unpackGalbe(
    new Uint8Array(await file.arrayBuffer()),
  );
  const store = await db();
  for (const [id, asset] of assets) {
    if (await store.getKey('assets', id)) continue;
    const entry = document.assets[id];
    await store.put('assets', {
      id,
      blob: new Blob([asset.bytes as Uint8Array<ArrayBuffer>], { type: asset.mime }),
      name: entry?.name ?? id,
      mime: asset.mime,
      size: asset.bytes.byteLength,
      createdAt: new Date().toISOString(),
    });
  }
  let doc = document;
  if (await projectExists(doc.id)) doc = { ...doc, id: createId(), name: `${doc.name} (imported)` };
  await saveProject(
    doc,
    thumbnail ? new Blob([thumbnail as Uint8Array<ArrayBuffer>], { type: 'image/png' }) : undefined,
  );
  await openDocument(doc);
  return { document: doc, warnings };
}

export const isGalbeError = (error: unknown): error is GalbeDocumentError =>
  error instanceof GalbeDocumentError;
