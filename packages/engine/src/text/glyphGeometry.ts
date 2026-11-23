import type { Font, Glyph } from 'opentype.js';
import { BufferGeometry, ExtrudeGeometry, Float32BufferAttribute } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TriangleSoup } from '../geometry/soup.ts';
import { glyphShapes } from './outline.ts';

export interface ExtrudeParams {
  size: number;
  depth: number;
  curveSegments: number;
  bevel: { enabled: boolean; size: number; thickness: number; segments: number };
  /** Max angle (radians) between faces that are shaded smoothly on the sides. */
  creaseAngle: number;
}

export const extrudeKey = (p: ExtrudeParams): string =>
  [
    p.size,
    p.depth,
    p.curveSegments,
    p.bevel.enabled,
    p.bevel.size,
    p.bevel.thickness,
    p.bevel.segments,
    p.creaseAngle,
  ].join(',');

/**
 * Extrudes one glyph into a triangle soup in glyph-local coordinates (origin on the
 * baseline), centred in Z. Faces (lids) keep exact flat normals; the sides and bevel get
 * creased normals so curves and bevels look smooth while corners stay crisp.
 */
export function extrudeGlyph(font: Font, glyph: Glyph, params: ExtrudeParams): TriangleSoup | null {
  const shapes = glyphShapes(glyph.path.commands, params.size / font.unitsPerEm);
  if (!shapes.length) return null;

  const bevel = params.bevel.enabled && (params.bevel.size > 0 || params.bevel.thickness > 0);
  const geometry = new ExtrudeGeometry(shapes, {
    depth: Math.max(params.depth, 1e-4),
    curveSegments: params.curveSegments,
    bevelEnabled: bevel,
    bevelSize: params.bevel.size,
    bevelThickness: params.bevel.thickness,
    // Keep the silhouette faithful to the typeface: the bevel grows inwards.
    bevelOffset: -params.bevel.size,
    bevelSegments: params.bevel.segments,
  });

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const lids: number[] = [];
  const sides: number[] = [];
  for (const group of geometry.groups) {
    const target = group.materialIndex === 0 ? lids : sides;
    for (let i = group.start; i < group.start + group.count; i++) target.push(i);
  }

  const total = lids.length + sides.length;
  const soup: TriangleSoup = {
    position: new Float32Array(total * 3),
    normal: new Float32Array(total * 3),
    uv: new Float32Array(total * 2),
    part: new Float32Array(total),
  };
  const zShift = -Math.max(params.depth, 1e-4) / 2;
  let w = 0;
  for (const i of lids) {
    soup.position.set([position.getX(i), position.getY(i), position.getZ(i) + zShift], w * 3);
    soup.normal.set([normal.getX(i), normal.getY(i), normal.getZ(i)], w * 3);
    soup.uv.set([uv.getX(i), uv.getY(i)], w * 2);
    w++;
  }

  if (sides.length) {
    const sideGeometry = new BufferGeometry();
    const sidePositions = new Float32Array(sides.length * 3);
    const sideUvs = new Float32Array(sides.length * 2);
    sides.forEach((i, k) => {
      sidePositions.set([position.getX(i), position.getY(i), position.getZ(i)], k * 3);
      sideUvs.set([uv.getX(i), uv.getY(i)], k * 2);
    });
    sideGeometry.setAttribute('position', new Float32BufferAttribute(sidePositions, 3));
    sideGeometry.setAttribute('uv', new Float32BufferAttribute(sideUvs, 2));
    const creased = toCreasedNormals(sideGeometry, params.creaseAngle);
    const cp = creased.getAttribute('position');
    const cn = creased.getAttribute('normal');
    const cu = creased.getAttribute('uv');
    for (let k = 0; k < cp.count; k++) {
      soup.position.set([cp.getX(k), cp.getY(k), cp.getZ(k) + zShift], w * 3);
      soup.normal.set([cn.getX(k), cn.getY(k), cn.getZ(k)], w * 3);
      soup.uv.set([cu.getX(k), cu.getY(k)], w * 2);
      w++;
    }
    creased.dispose();
    sideGeometry.dispose();
  }
  geometry.dispose();
  return soup;
}

/** Small LRU cache: extruding glyphs is the expensive step, and letters repeat. */
export class GlyphCache {
  private readonly entries = new Map<string, TriangleSoup | null>();
  constructor(private readonly capacity = 4096) {}

  get(key: string, build: () => TriangleSoup | null): TriangleSoup | null {
    if (this.entries.has(key)) {
      const value = this.entries.get(key)!;
      this.entries.delete(key);
      this.entries.set(key, value);
      return value;
    }
    const value = build();
    this.entries.set(key, value);
    if (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
