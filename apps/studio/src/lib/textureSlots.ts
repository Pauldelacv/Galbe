import type { TextureSlot } from '@galbe/core';

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
