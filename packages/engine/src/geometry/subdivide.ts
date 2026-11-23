import type { TriangleSoup } from './soup.ts';

/**
 * Refines triangles so that no edge spans more than `maxSpan` along X.
 *
 * The decision to split an edge depends only on that edge (its two endpoints), and the
 * midpoint is computed symmetrically, so the two triangles sharing an edge always agree:
 * the result has no T-junctions and stays watertight after a non-linear deformation.
 * Splitting only on the X extent is enough for Galbe's deformers, which are all linear
 * along Y and Z for a fixed X.
 *
 * @param maxVertices stop refining (keeping a valid mesh) once this size would be exceeded.
 */
export function subdivideAlongX(
  soup: TriangleSoup,
  maxSpan: number,
  maxVertices = 3_000_000,
): TriangleSoup {
  let current = soup;
  for (let iteration = 0; iteration < 12; iteration++) {
    const next = refineOnce(current, maxSpan, maxVertices);
    if (!next) break;
    current = next;
  }
  return current;
}

function refineOnce(soup: TriangleSoup, maxSpan: number, maxVertices: number): TriangleSoup | null {
  const { position: P, normal: N, uv: U, part: G } = soup;
  const triangles = P.length / 9;
  const split = (a: number, b: number) => Math.abs(P[a * 3]! - P[b * 3]!) > maxSpan;

  // First pass: count output triangles.
  let outTriangles = 0;
  for (let t = 0; t < triangles; t++) {
    const a = t * 3;
    const n = Number(split(a, a + 1)) + Number(split(a + 1, a + 2)) + Number(split(a + 2, a));
    outTriangles += n + 1;
  }
  if (outTriangles === triangles) return null;
  if (outTriangles * 3 > maxVertices) return null;

  const out: TriangleSoup = {
    position: new Float32Array(outTriangles * 9),
    normal: new Float32Array(outTriangles * 9),
    uv: new Float32Array(outTriangles * 6),
    part: new Float32Array(outTriangles * 3),
  };
  let w = 0;
  // Scratch vertex storage: indices 0..2 are the corners, 3..5 midpoints of ab, bc, ca.
  const vp = new Float64Array(18);
  const vn = new Float64Array(18);
  const vu = new Float64Array(12);
  let part = 0;

  const loadCorner = (slot: number, index: number) => {
    for (let k = 0; k < 3; k++) {
      vp[slot * 3 + k] = P[index * 3 + k]!;
      vn[slot * 3 + k] = N[index * 3 + k]!;
    }
    vu[slot * 2] = U[index * 2]!;
    vu[slot * 2 + 1] = U[index * 2 + 1]!;
  };
  const midpoint = (slot: number, a: number, b: number) => {
    for (let k = 0; k < 3; k++) {
      vp[slot * 3 + k] = (vp[a * 3 + k]! + vp[b * 3 + k]!) * 0.5;
      vn[slot * 3 + k] = (vn[a * 3 + k]! + vn[b * 3 + k]!) * 0.5;
    }
    const len = Math.hypot(vn[slot * 3]!, vn[slot * 3 + 1]!, vn[slot * 3 + 2]!) || 1;
    for (let k = 0; k < 3; k++) vn[slot * 3 + k]! /= len;
    vu[slot * 2] = (vu[a * 2]! + vu[b * 2]!) * 0.5;
    vu[slot * 2 + 1] = (vu[a * 2 + 1]! + vu[b * 2 + 1]!) * 0.5;
  };
  const emit = (...slots: number[]) => {
    for (const slot of slots) {
      for (let k = 0; k < 3; k++) {
        out.position[w * 3 + k] = vp[slot * 3 + k]!;
        out.normal[w * 3 + k] = vn[slot * 3 + k]!;
      }
      out.uv[w * 2] = vu[slot * 2]!;
      out.uv[w * 2 + 1] = vu[slot * 2 + 1]!;
      out.part[w] = part;
      w++;
    }
  };

  for (let t = 0; t < triangles; t++) {
    const base = t * 3;
    // Midpoints use the original float32 values in a fixed (min index) order per edge,
    // which is symmetric anyway: (a + b) / 2 === (b + a) / 2 in IEEE arithmetic.
    loadCorner(0, base);
    loadCorner(1, base + 1);
    loadCorner(2, base + 2);
    part = G[base]!;
    const sAB = split(base, base + 1);
    const sBC = split(base + 1, base + 2);
    const sCA = split(base + 2, base);
    if (sAB) midpoint(3, 0, 1);
    if (sBC) midpoint(4, 1, 2);
    if (sCA) midpoint(5, 2, 0);
    const count = Number(sAB) + Number(sBC) + Number(sCA);
    if (count === 0) emit(0, 1, 2);
    else if (count === 3) emit(0, 3, 5, 3, 1, 4, 5, 4, 2, 3, 4, 5);
    else if (count === 1) {
      if (sAB) emit(0, 3, 2, 3, 1, 2);
      else if (sBC) emit(0, 1, 4, 0, 4, 2);
      else emit(0, 1, 5, 1, 2, 5);
    } else if (!sCA) emit(3, 1, 4, 0, 3, 4, 0, 4, 2);
    else if (!sAB) emit(4, 2, 5, 1, 4, 5, 1, 5, 0);
    else emit(5, 0, 3, 2, 5, 3, 2, 3, 1);
  }
  return out;
}
