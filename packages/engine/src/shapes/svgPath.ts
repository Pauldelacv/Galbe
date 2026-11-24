import { type Curve, Path, type Vector2 } from 'three';

/*
 * Normalised SVG path data, as stored in shape nodes: absolute coordinates, transforms
 * baked in, commands `M L C Q Z` only. Parsing it needs no DOM, so geometry can be built
 * anywhere (Node tests, workers, the embed player).
 */

export interface SubPath {
  path: Path;
  closed: boolean;
}

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;

/** Parses normalised path data into `THREE.Path` subpaths. */
export function parsePathData(d: string): SubPath[] {
  const out: SubPath[] = [];
  let current: SubPath | null = null;
  const tokens = d.match(/[MLCQZ]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  let command = '';
  let i = 0;
  const next = () => Number(tokens[i++]);
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/^[MLCQZ]$/i.test(token)) {
      command = token.toUpperCase();
      i++;
      if (command === 'Z') {
        if (current) current.closed = true;
        current = null;
        continue;
      }
    }
    switch (command) {
      case 'M': {
        current = { path: new Path(), closed: false };
        current.path.moveTo(next(), next());
        out.push(current);
        command = 'L'; // implicit lineto after moveto
        break;
      }
      case 'L':
        current?.path.lineTo(next(), next());
        break;
      case 'C':
        current?.path.bezierCurveTo(next(), next(), next(), next(), next(), next());
        break;
      case 'Q':
        current?.path.quadraticCurveTo(next(), next(), next(), next());
        break;
      default:
        i++; // stray number
    }
  }
  return out;
}

const fmt = (value: number) => {
  const r = Math.round(value * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};
const pt = (v: Vector2) => `${fmt(v.x)} ${fmt(v.y)}`;

type CurveLike = Curve<Vector2> & {
  type?: string;
  v1?: Vector2;
  v2?: Vector2;
  v3?: Vector2;
};

/**
 * Serialises `THREE.Path` subpaths (e.g. from `SVGLoader`) to normalised path data.
 * Lines and Béziers are kept exact; arcs and other curves are sampled.
 */
export function serializeSubPaths(
  subPaths: readonly { curves: Curve<Vector2>[]; autoClose?: boolean; currentPoint?: Vector2 }[],
  arcSegments = 24,
): string {
  const parts: string[] = [];
  for (const sub of subPaths) {
    const curves = sub.curves as CurveLike[];
    if (!curves.length) continue;
    const start = curves[0]!.getPoint(0);
    parts.push(`M${pt(start)}`);
    for (const curve of curves) {
      switch (curve.type) {
        case 'LineCurve':
          parts.push(`L${pt(curve.v2!)}`);
          break;
        case 'CubicBezierCurve':
          parts.push(`C${pt(curve.v1!)} ${pt(curve.v2!)} ${pt(curve.v3!)}`);
          break;
        case 'QuadraticBezierCurve':
          parts.push(`Q${pt(curve.v1!)} ${pt(curve.v2!)}`);
          break;
        default: {
          const points = curve.getPoints(arcSegments);
          for (const point of points.slice(1)) parts.push(`L${pt(point)}`);
        }
      }
    }
    if (sub.autoClose !== false) parts.push('Z');
  }
  return parts.join('');
}

/** Bounds of path data in its own units, or null when empty. */
export function pathDataBounds(
  d: string,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const values = (d.match(NUMBER) ?? []).map(Number);
  if (values.length < 2) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const sub of parsePathData(d)) {
    for (const p of sub.path.getPoints(4)) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : null;
}
