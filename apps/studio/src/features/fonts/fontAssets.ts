import { type AssetEntry, type FontRef, projectAssetUri } from '@galbe/core';
import { parseFont } from '@galbe/engine';
import { controller } from '../../engine/studioEngine.ts';
import { putAsset } from '../../persistence/assetStore.ts';
import { documentApi } from '../../state/documentStore.ts';

const FONTSOURCE_API = 'https://api.fontsource.org/v1/fonts';
const CATALOG_CACHE_KEY = 'galbe:fontsource-catalog';
const CATALOG_TTL_MS = 7 * 24 * 3600 * 1000;

/** Registers an asset in the open document (metadata only; bytes are in IndexedDB). */
function addAssetToDocument(entry: AssetEntry): void {
  documentApi.update(
    (draft) => {
      draft.assets[entry.id] = entry;
    },
    { history: false },
  );
}

/** Reads family / weight / style from a font file's name and OS/2 tables. */
export function describeFont(bytes: ArrayBuffer, fallbackName: string): Omit<FontRef, 'files'> {
  const font = parseFont(bytes);
  const name = (key: string) => {
    try {
      return font.getEnglishName(key) || undefined;
    } catch {
      return undefined;
    }
  };
  const family =
    name('preferredFamily') ?? name('fontFamily') ?? fallbackName.replace(/\.[^.]+$/, '');
  const subfamily = (name('preferredSubfamily') ?? name('fontSubfamily') ?? '').toLowerCase();
  const os2 = font.tables.os2 as { usWeightClass?: number; fsSelection?: number } | undefined;
  const weight =
    os2?.usWeightClass && os2.usWeightClass >= 1 && os2.usWeightClass <= 1000
      ? os2.usWeightClass
      : 400;
  const italic = ((os2?.fsSelection ?? 0) & 1) === 1 || /italic|oblique/.test(subfamily);
  return { family, weight, style: italic ? 'italic' : 'normal' };
}

/** Imports a TTF/OTF/WOFF file into the project and returns a font reference to it. */
export async function importFontFile(file: File): Promise<FontRef> {
  const bytes = await file.arrayBuffer();
  const info = describeFont(bytes, file.name);
  const entry = await putAsset(bytes, {
    name: file.name,
    kind: 'font',
    meta: { source: 'upload', family: info.family },
  });
  addAssetToDocument(entry);
  const uri = projectAssetUri(entry.id);
  controller.fonts.register(uri, bytes);
  return { ...info, files: [uri] };
}

export interface CatalogFamily {
  id: string;
  family: string;
  category: string;
  weights: number[];
  styles: string[];
  subsets: string[];
  defSubset: string;
}

/** The Google Fonts catalogue as listed by Fontsource (cached for a week). */
export async function loadGoogleCatalog(): Promise<CatalogFamily[]> {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) ?? 'null') as {
      at: number;
      families: CatalogFamily[];
    } | null;
    if (cached && Date.now() - cached.at < CATALOG_TTL_MS && cached.families.length)
      return cached.families;
  } catch {
    // Ignore a corrupt or unavailable cache.
  }
  const response = await fetch(FONTSOURCE_API);
  if (!response.ok) throw new Error(`Font catalogue unavailable (${response.status}).`);
  const all = (await response.json()) as (CatalogFamily & { type: string })[];
  const families = all
    .filter((font) => font.type === 'google')
    .map(({ id, family, category, weights, styles, subsets, defSubset }) => ({
      id,
      family,
      category,
      weights,
      styles,
      subsets,
      defSubset,
    }));
  try {
    localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ at: Date.now(), families }));
  } catch {
    // Quota exceeded: keep working without the cache.
  }
  return families;
}

/** URL of a small WOFF2 used only for previewing a family in the picker. */
export function googlePreviewUrl(family: CatalogFamily, weight: number, style = 'normal'): string {
  const subset = family.subsets.includes('latin') ? 'latin' : family.defSubset;
  return `https://cdn.jsdelivr.net/fontsource/fonts/${family.id}@latest/${subset}-${weight}-${style}.woff2`;
}

/**
 * Downloads a Google font face (TTF, Latin + Latin Extended when available) into the
 * project, so it keeps working offline and travels inside `.galbe` files.
 */
export async function downloadGoogleFont(
  family: CatalogFamily,
  weight: number,
  style: 'normal' | 'italic',
): Promise<FontRef> {
  const response = await fetch(`${FONTSOURCE_API}/${family.id}`);
  if (!response.ok) throw new Error(`Could not fetch "${family.family}" (${response.status}).`);
  const details = (await response.json()) as {
    variants: Record<string, Record<string, Record<string, { url: { ttf?: string } }>>>;
    license?: string;
  };
  const variant = details.variants[String(weight)]?.[style];
  if (!variant) throw new Error(`"${family.family}" has no ${weight} ${style} style.`);
  const subsets = ['latin', 'latin-ext'].filter((subset) => variant[subset]?.url.ttf);
  if (!subsets.length && variant[family.defSubset]?.url.ttf) subsets.push(family.defSubset);
  if (!subsets.length) throw new Error(`"${family.family}" is not available as TTF.`);

  const files: FontRef['files'] = [];
  for (const subset of subsets) {
    const fileResponse = await fetch(variant[subset]!.url.ttf!);
    if (!fileResponse.ok)
      throw new Error(`Download failed for "${family.family}" (${fileResponse.status}).`);
    const bytes = await fileResponse.arrayBuffer();
    const entry = await putAsset(bytes, {
      name: `${family.id}-${subset}-${weight}-${style}.ttf`,
      kind: 'font',
      meta: {
        source: 'fontsource',
        family: family.family,
        subset,
        license: details.license ?? 'OFL-1.1',
      },
    });
    addAssetToDocument(entry);
    const uri = projectAssetUri(entry.id);
    controller.fonts.register(uri, bytes);
    files.push(uri);
  }
  return { family: family.family, weight, style, files };
}
