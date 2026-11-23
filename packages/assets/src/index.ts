import { BUILTIN_FONTS } from './fonts.generated.ts';
import { BUILTIN_HDRIS } from './hdri.generated.ts';
import type { BuiltinFontFace, BuiltinFontFamily } from './types.ts';

export { BUILTIN_FONTS } from './fonts.generated.ts';
export { BUILTIN_HDRIS } from './hdri.generated.ts';
export type * from './types.ts';

/**
 * Hosts serve `packages/assets/files` under this path (relative to their base URL).
 * The studio's Vite plugin and the player's loader both use it.
 */
export const BUILTIN_PATH = 'builtin/';

const files = new Map<string, string>();
for (const family of BUILTIN_FONTS) {
  for (const face of family.faces) for (const id of face.files) files.set(id, `${id}.ttf`);
}
for (const hdri of BUILTIN_HDRIS) files.set(hdri.id, hdri.file);

/** File path (relative to the builtin base) for a builtin id, e.g. `hdri/x` → `hdri/x.hdr`. */
export function builtinFilePath(id: string): string | undefined {
  return files.get(id);
}

export function builtinIds(): string[] {
  return [...files.keys()];
}

export function getBuiltinHdri(id: string) {
  return BUILTIN_HDRIS.find((hdri) => hdri.id === id);
}

export function getBuiltinFontFamily(familyName: string): BuiltinFontFamily | undefined {
  return BUILTIN_FONTS.find((family) => family.family === familyName || family.id === familyName);
}

/** Closest face of a family for a weight/style (same style preferred, then nearest weight). */
export function closestFace(
  family: BuiltinFontFamily,
  weight: number,
  style: 'normal' | 'italic',
): BuiltinFontFace {
  const candidates = family.faces.filter((face) => face.style === style);
  const pool = candidates.length ? candidates : family.faces;
  return pool.reduce((best, face) =>
    Math.abs(face.weight - weight) < Math.abs(best.weight - weight) ? face : best,
  );
}
