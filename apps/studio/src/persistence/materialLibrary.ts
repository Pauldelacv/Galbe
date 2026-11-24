import {
  type AssetEntry,
  AssetEntrySchema,
  collectProjectAssetIds,
  createId,
  type MaterialSpec,
  MaterialSpecSchema,
} from '@galbe/core';
import { create } from 'zustand';
import { db, type LibraryMaterialRecord } from './db.ts';

/** The user's saved materials (local to this browser, shared by every project). */
export const useMaterialLibrary = create<{ items: LibraryMaterialRecord[]; loaded: boolean }>()(
  () => ({ items: [], loaded: false }),
);

export async function loadMaterialLibrary(): Promise<void> {
  const items = await (await db()).getAll('library');
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  useMaterialLibrary.setState({ items, loaded: true });
}

export async function saveToLibrary(
  spec: MaterialSpec,
  assets: Readonly<Record<string, AssetEntry>>,
): Promise<void> {
  const ids = collectProjectAssetIds(spec);
  const record: LibraryMaterialRecord = {
    id: createId(),
    name: spec.name,
    spec: { ...spec, preset: undefined },
    assets: [...ids].map((id) => assets[id]).filter(Boolean),
    createdAt: new Date().toISOString(),
  };
  await (await db()).put('library', record);
  await loadMaterialLibrary();
}

export async function removeFromLibrary(id: string): Promise<void> {
  await (await db()).delete('library', id);
  await loadMaterialLibrary();
}

/** A library item as a validated spec plus the asset metadata it needs. */
export function libraryItemSpec(
  record: LibraryMaterialRecord,
): { spec: Omit<MaterialSpec, 'id'>; assets: AssetEntry[] } | null {
  const parsed = MaterialSpecSchema.safeParse({ ...(record.spec as object), id: 'x' });
  if (!parsed.success) return null;
  const { id: _id, ...spec } = parsed.data;
  const assets = record.assets
    .map((entry) => AssetEntrySchema.safeParse(entry))
    .filter((result) => result.success)
    .map((result) => result.data!);
  return { spec, assets };
}

/** CSS swatch for a spec (no rendering needed). */
export function swatchFor(spec: MaterialSpec): string {
  if (spec.type === 'matcap') return spec.color;
  const c = spec.color;
  if (spec.transmission > 0.5)
    return `radial-gradient(circle at 30% 25%, #fff 0 8%, ${c}66 40%, ${c}aa)`;
  if (spec.metalness > 0.5)
    return `linear-gradient(160deg, #fff 0%, ${c} 35%, #111 52%, ${c} 72%, #fff 100%)`;
  return `radial-gradient(circle at 30% 25%, #ffffffaa 0 8%, ${c} 35%, #000000cc 120%)`;
}
