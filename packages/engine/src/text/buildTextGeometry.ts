import type { TextNode } from '@galbe/core';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { LoadedFace } from '../fonts/FontLibrary.ts';
import { deformSoup, hasActiveDeform } from '../geometry/deform.ts';
import {
  emptySoup,
  mergeSoups,
  soupBounds,
  type TriangleSoup,
  translateSoup,
} from '../geometry/soup.ts';
import { type ExtrudeParams, extrudeGlyph, extrudeKey, GlyphCache } from './glyphGeometry.ts';
import { layoutText } from './layout.ts';

export const DEFAULT_CREASE_ANGLE = (35 * Math.PI) / 180;

export type TextGeometryParams = Pick<
  TextNode,
  | 'text'
  | 'size'
  | 'depth'
  | 'curveSegments'
  | 'bevel'
  | 'letterSpacing'
  | 'lineHeight'
  | 'align'
  | 'deform'
>;

export interface TextGeometryResult {
  soup: TriangleSoup;
  /** Number of drawable glyphs (the `part` attribute ranges over 0…glyphCount-1). */
  glyphCount: number;
  /** Size of the undeformed block. */
  width: number;
  height: number;
}

const sharedCache = new GlyphCache();

/** Builds text as a triangle soup centred on its bounding box. */
export function buildTextSoup(
  face: LoadedFace,
  params: TextGeometryParams,
  cache = sharedCache,
): TextGeometryResult {
  const layout = layoutText(params.text, face, params);
  const extrude: ExtrudeParams = {
    size: params.size,
    depth: params.depth,
    curveSegments: params.curveSegments,
    bevel: params.bevel,
    creaseAngle: DEFAULT_CREASE_ANGLE,
  };
  const key = extrudeKey(extrude);
  const items: Parameters<typeof mergeSoups>[0] = [];
  let glyphCount = 0;
  for (const placed of layout.glyphs) {
    const soup = cache.get(`${face.key}#${placed.fontIndex}:${placed.glyph.index}@${key}`, () =>
      extrudeGlyph(placed.font, placed.glyph, extrude),
    );
    if (!soup) continue;
    items.push({ soup, offset: [placed.x, placed.y, 0], part: placed.order });
    glyphCount++;
  }
  if (!items.length) return { soup: emptySoup(), glyphCount: 0, width: 0, height: 0 };

  let soup = mergeSoups(items);
  const { min, max } = soupBounds(soup);
  translateSoup(soup, -(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -(min[2] + max[2]) / 2);
  const width = max[0] - min[0];
  const height = max[1] - min[1];
  if (hasActiveDeform(params.deform)) soup = deformSoup(soup, params.deform, width);
  return { soup, glyphCount, width, height };
}

export function soupToGeometry(soup: TriangleSoup): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(soup.position, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(soup.normal, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(soup.uv, 2));
  geometry.setAttribute('part', new Float32BufferAttribute(soup.part, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Cache key for everything that affects the text mesh. */
export const textBuildKey = (face: LoadedFace, p: TextGeometryParams): string =>
  JSON.stringify([
    face.key,
    p.text,
    p.size,
    p.depth,
    p.curveSegments,
    p.bevel,
    p.letterSpacing,
    p.lineHeight,
    p.align,
    p.deform,
  ]);
