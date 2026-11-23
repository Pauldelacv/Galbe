import { projectAssetUri } from '@galbe/core';
import { putAsset } from '../../persistence/assetStore.ts';
import { documentApi } from '../../state/documentStore.ts';

export const HDRI_ACCEPT = '.hdr,image/vnd.radiance';

/** Stores an equirectangular .hdr in the project and lights the scene with it. */
export async function importHdriFile(file: File): Promise<void> {
  const bytes = await file.arrayBuffer();
  const header = new TextDecoder().decode(new Uint8Array(bytes, 0, Math.min(10, bytes.byteLength)));
  if (!header.startsWith('#?')) throw new Error(`${file.name} is not a Radiance .hdr file.`);
  const entry = await putAsset(bytes, {
    name: file.name,
    kind: 'hdri',
    mime: 'image/vnd.radiance',
    meta: { source: 'upload' },
  });
  documentApi.update(
    (draft) => {
      draft.assets[entry.id] = entry;
      draft.environment.hdri = projectAssetUri(entry.id);
    },
    { label: 'Import environment' },
  );
}
