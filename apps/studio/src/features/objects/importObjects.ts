import { isMeshNode, nodeMaterialIds, projectAssetUri, type TextureSlot } from '@galbe/core';
import { unzipSync } from 'fflate';
import { pickFiles } from '../../lib/files.ts';
import { putAsset } from '../../persistence/assetStore.ts';
import { documentApi } from '../../state/documentStore.ts';
import {
  addEffect,
  addModelFile,
  addShapeFromSvg,
  MODEL_ACCEPT,
} from '../../state/objectActions.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';

const report = (error: unknown, fallback: string) =>
  notify(error instanceof Error ? error.message : fallback, 'error');

export async function importSvgFromPicker(): Promise<void> {
  const [file] = await pickFiles('.svg,image/svg+xml');
  if (!file) return;
  try {
    await addShapeFromSvg(await file.text(), { file });
  } catch (error) {
    report(error, `${file.name} could not be imported.`);
  }
}

export async function importModelFromPicker(): Promise<void> {
  const [file] = await pickFiles(MODEL_ACCEPT);
  if (!file) return;
  try {
    await addModelFile(file);
  } catch (error) {
    report(error, `${file.name} could not be imported.`);
  }
}

/** One picker for everything Galbe can import. */
export async function importAnything(): Promise<void> {
  const files = await pickFiles(
    '.galbe,.svg,.glb,.gltf,.fbx,.obj,.ttf,.otf,.woff,.hdr,.cube,.png,.jpg,.jpeg,.webp,.zip',
    true,
  );
  if (!files.length) return;
  const { handleFiles } = await import('../../app/fileDrop.ts');
  await handleFiles(files);
}

/** Material ids the material inspector currently edits (selection, or the active path). */
export function targetMaterialIds(): string[] {
  const { selection, activePath } = useUiStore.getState();
  const doc = documentApi.get();
  const ids: string[] = [];
  for (const node of doc.nodes) {
    if (!selection.includes(node.id) || !isMeshNode(node)) continue;
    if (node.type === 'model' && !node.overrideMaterial) continue;
    if (node.type === 'shape' && activePath) {
      const path = node.paths.find((candidate) => candidate.id === activePath);
      if (path) {
        ids.push(path.materialId ?? node.materialId);
        continue;
      }
    }
    for (const id of nodeMaterialIds(node)) if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/** Recognises PBR map files by name (ambientCG, Poly Haven, Substance conventions). */
export function textureSlotFromName(name: string): TextureSlot | null {
  const base = name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
  if (
    /(^|[_\-. ])(normal(gl)?|nor(_gl)?|nrm)([_\-. ]|$)/.test(base) &&
    !/normaldx|nor_dx/.test(base)
  )
    return 'normalMap';
  if (/normaldx|nor_dx/.test(base)) return 'normalMap';
  if (/(^|[_\-. ])(roughness|rough|rgh)([_\-. ]|$)/.test(base)) return 'roughnessMap';
  if (/(^|[_\-. ])(metalness|metallic|metal)([_\-. ]|$)/.test(base)) return 'metalnessMap';
  if (/(^|[_\-. ])(ambientocclusion|ao|occlusion)([_\-. ]|$)/.test(base)) return 'aoMap';
  if (/(^|[_\-. ])(emission|emissive|emit)([_\-. ]|$)/.test(base)) return 'emissiveMap';
  if (/(^|[_\-. ])(opacity|alpha|mask)([_\-. ]|$)/.test(base)) return 'alphaMap';
  if (
    /(^|[_\-. ])(color|colour|basecolor|base_color|albedo|diffuse|diff|col)([_\-. ]|$)/.test(base)
  )
    return 'map';
  return null;
}

const IMAGE = /\.(png|jpe?g|webp|avif)$/i;

/** Stores image files as textures of the selected material(s), by slot. */
export async function applyTextureFiles(
  files: { name: string; bytes: Uint8Array }[],
  fallbackSlot: TextureSlot = 'map',
): Promise<number> {
  const materialIds = targetMaterialIds();
  if (!materialIds.length) {
    notify('Select a layer to apply textures to its material.', 'info');
    return 0;
  }
  const assigned = new Map<
    TextureSlot,
    { uri: string; entry: Awaited<ReturnType<typeof putAsset>> }
  >();
  for (const file of files) {
    if (!IMAGE.test(file.name)) continue;
    const slot = textureSlotFromName(file.name) ?? (files.length === 1 ? fallbackSlot : null);
    if (!slot || assigned.has(slot)) continue;
    const entry = await putAsset(file.bytes, { name: file.name, kind: 'image' });
    assigned.set(slot, { uri: projectAssetUri(entry.id), entry });
  }
  if (!assigned.size) return 0;
  documentApi.update(
    (draft) => {
      for (const { entry } of assigned.values()) draft.assets[entry.id] = entry;
      for (const id of materialIds) {
        const material = draft.materials[id];
        if (material?.type !== 'physical') continue;
        for (const [slot, { uri }] of assigned) material.textures[slot] = uri;
        // A full PBR set drives roughness and metalness through its maps.
        if (assigned.has('roughnessMap')) material.roughness = 1;
        if (assigned.has('metalnessMap')) material.metalness = 1;
        if (assigned.has('map')) material.color = '#ffffff';
      }
    },
    { label: assigned.size > 1 ? 'Apply texture set' : 'Apply texture' },
  );
  return assigned.size;
}

/** A zipped texture set (e.g. an ambientCG download) → textures of the selection. */
export async function applyTextureZip(file: File): Promise<number> {
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => IMAGE.test(entry.name) && !entry.name.startsWith('__MACOSX'),
  });
  // Prefer the smallest resolution variant per slot only when several exist: keep the first.
  const files = Object.entries(entries)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, bytes]) => ({ name: name.split('/').at(-1)!, bytes }));
  return applyTextureFiles(files);
}

/** Imports a .cube LUT: sets it on the LUT effect (adding one when needed). */
export async function importLutFile(file: File, effectId?: string): Promise<void> {
  const text = await file.text();
  const { parseCubeLut } = await import('@galbe/engine');
  parseCubeLut(text); // validate before storing
  const entry = await putAsset(new TextEncoder().encode(text), {
    name: file.name,
    kind: 'other',
    mime: 'text/plain',
    meta: { source: 'upload', type: 'lut' },
  });
  let target = effectId ?? documentApi.get().effects.find((effect) => effect.type === 'lut')?.id;
  if (!target) {
    addEffect('lut');
    target = documentApi.get().effects.at(-1)!.id;
  }
  documentApi.update(
    (draft) => {
      draft.assets[entry.id] = entry;
      const effect = draft.effects.find((candidate) => candidate.id === target);
      if (effect) effect.params.lut = projectAssetUri(entry.id);
    },
    { label: 'Import LUT' },
  );
  useUiStore.getState().setExpandedEffect(target);
}
