import type { Deform } from '@galbe/core';
import type { TriangleSoup } from './soup.ts';
import { subdivideAlongX } from './subdivide.ts';

const DEG = Math.PI / 180;

/** Maps a point in place. Deformers are pure and composable. */
export type Deformer = (p: [number, number, number]) => void;

export interface DeformExtent {
  /** Width of the block the deformation is normalised to (X extent). */
  width: number;
}

/** Builds the active deformers in application order: wave → twist → bend. */
export function createDeformers(deform: Deform, { width }: DeformExtent): Deformer[] {
  const deformers: Deformer[] = [];
  const w = Math.max(width, 1e-6);

  const { wave, twist, bend } = deform;
  if (wave.enabled && wave.amplitude > 0 && wave.frequency > 0) {
    const k = (2 * Math.PI * wave.frequency) / w;
    const phase = wave.phase * DEG;
    const axis = wave.axis === 'y' ? 1 : 2;
    deformers.push((p) => {
      p[axis] += wave.amplitude * Math.sin(k * p[0] + phase);
    });
  }
  if (twist.enabled && twist.angle !== 0) {
    const perUnit = (twist.angle * DEG) / w;
    deformers.push((p) => {
      const a = p[0] * perUnit;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const y = p[1];
      const z = p[2];
      p[1] = y * c - z * s;
      p[2] = y * s + z * c;
    });
  }
  if (bend.enabled && Math.abs(bend.angle) > 1e-3) {
    const radius = w / (bend.angle * DEG);
    if (bend.mode === 'arc') {
      // Curve the baseline in the text plane around a centre below (angle > 0: arch).
      deformers.push((p) => {
        const phi = p[0] / radius;
        const r = radius + p[1];
        p[0] = r * Math.sin(phi);
        p[1] = r * Math.cos(phi) - radius;
      });
    } else {
      // Wrap around a vertical cylinder behind the text (angle > 0: convex to the viewer).
      deformers.push((p) => {
        const phi = p[0] / radius;
        const r = radius + p[2];
        p[0] = r * Math.sin(phi);
        p[2] = r * Math.cos(phi) - radius;
      });
    }
  }
  return deformers;
}

export const hasActiveDeform = (deform: Deform): boolean =>
  (deform.wave.enabled && deform.wave.amplitude > 0 && deform.wave.frequency > 0) ||
  (deform.twist.enabled && deform.twist.angle !== 0) ||
  (deform.bend.enabled && Math.abs(deform.bend.angle) > 1e-3);

/** Max X span of an edge before deformation, so curves look smooth. */
export function refinementSpan(deform: Deform, width: number): number {
  let segments = 48;
  if (deform.wave.enabled) segments = Math.max(segments, deform.wave.frequency * 24);
  if (deform.twist.enabled)
    segments = Math.max(segments, (Math.abs(deform.twist.angle) / 360) * 64);
  if (deform.bend.enabled) segments = Math.max(segments, (Math.abs(deform.bend.angle) / 360) * 128);
  return width / Math.min(segments, 512);
}

/**
 * Applies deformers to a soup (positions in place) and transforms normals with the
 * cofactor of the numerical Jacobian, so smooth surfaces stay smooth.
 */
export function applyDeformers(soup: TriangleSoup, deformers: Deformer[], epsilon: number): void {
  if (!deformers.length) return;
  const map = (p: [number, number, number]) => {
    for (const deformer of deformers) deformer(p);
    return p;
  };
  const P = soup.position;
  const N = soup.normal;
  const h = epsilon;
  const px: [number, number, number] = [0, 0, 0];
  const mx: [number, number, number] = [0, 0, 0];
  const J = new Float64Array(9); // column-major: J[c*3 + r] = d(out_r)/d(in_c)
  for (let i = 0; i < P.length; i += 3) {
    const x = P[i]!;
    const y = P[i + 1]!;
    const z = P[i + 2]!;
    for (let c = 0; c < 3; c++) {
      px[0] = x;
      px[1] = y;
      px[2] = z;
      mx[0] = x;
      mx[1] = y;
      mx[2] = z;
      px[c]! += h;
      mx[c]! -= h;
      map(px);
      map(mx);
      for (let r = 0; r < 3; r++) J[c * 3 + r] = (px[r]! - mx[r]!) / (2 * h);
    }
    const out = map([x, y, z]);
    P[i] = out[0];
    P[i + 1] = out[1];
    P[i + 2] = out[2];

    // n' = cof(J) · n, with cof(J) = det(J) · J^-T (orientation-preserving maps: det > 0).
    const a = J[0]!,
      b = J[3]!,
      c = J[6]!; // row 0
    const d = J[1]!,
      e = J[4]!,
      f = J[7]!; // row 1
    const g = J[2]!,
      k = J[5]!,
      l = J[8]!; // row 2
    const nx = N[i]!;
    const ny = N[i + 1]!;
    const nz = N[i + 2]!;
    const ox = (e * l - f * k) * nx + (f * g - d * l) * ny + (d * k - e * g) * nz;
    const oy = (c * k - b * l) * nx + (a * l - c * g) * ny + (b * g - a * k) * nz;
    const oz = (b * f - c * e) * nx + (c * d - a * f) * ny + (a * e - b * d) * nz;
    const len = Math.hypot(ox, oy, oz) || 1;
    N[i] = ox / len;
    N[i + 1] = oy / len;
    N[i + 2] = oz / len;
  }
}

/** Subdivides as needed, then deforms. Returns the (possibly new) soup. */
export function deformSoup(soup: TriangleSoup, deform: Deform, width: number): TriangleSoup {
  const deformers = createDeformers(deform, { width });
  if (!deformers.length) return soup;
  const refined = subdivideAlongX(soup, refinementSpan(deform, width));
  applyDeformers(refined, deformers, Math.max(width, 1) * 1e-4);
  return refined;
}
