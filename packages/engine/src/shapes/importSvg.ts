import type { ShapePathInput } from '@galbe/core';
import { SRGBColorSpace } from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { pathDataBounds, serializeSubPaths } from './svgPath.ts';

export interface ImportedSvg {
  viewBox: [number, number, number, number];
  paths: (ShapePathInput & { sourceColor: string })[];
  /** Paths that were skipped (empty, invisible), for user feedback. */
  skipped: number;
}

export class SvgImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SvgImportError';
  }
}

const MAX_PATHS = 2000;

interface SvgStyle {
  fill?: string;
  fillOpacity?: number;
  fillRule?: string;
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeLineJoin?: string;
  strokeLineCap?: string;
  opacity?: number;
  visibility?: string;
}

/**
 * Turns SVG markup into normalised shape paths: one entry per filled region and one per
 * stroke, transforms baked in, colours resolved. Needs a DOM (`DOMParser`): call it in
 * the browser (the studio) or provide one (tests use linkedom).
 */
export function importSvg(text: string, idPrefix = 'p'): ImportedSvg {
  if (!/<svg[\s>]/i.test(text)) throw new SvgImportError('This is not an SVG file.');
  const data = new SVGLoader().parse(text);
  const root = (data.xml as unknown as { documentElement?: Element }).documentElement ?? null;
  const paths: ImportedSvg['paths'] = [];
  let skipped = 0;
  let index = 0;

  for (const shapePath of data.paths) {
    const node = shapePath.userData?.node as Element | undefined;
    const raw = (shapePath.userData?.style ?? {}) as SvgStyle;
    // Some DOMs report unknown style properties as undefined, which SVGLoader turns
    // into NaN: fall back to the presentation attribute, then to the SVG default.
    const number = (value: number | undefined, attribute: string, fallback: number) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      const parsed = Number.parseFloat(node?.getAttribute?.(attribute) ?? '');
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const text = (value: string | undefined, attribute: string) =>
      value || node?.getAttribute?.(attribute) || undefined;
    const style: SvgStyle = {
      ...raw,
      fillRule: text(raw.fillRule, 'fill-rule'),
      strokeLineJoin: text(raw.strokeLineJoin, 'stroke-linejoin'),
      strokeLineCap: text(raw.strokeLineCap, 'stroke-linecap'),
      fillOpacity: number(raw.fillOpacity, 'fill-opacity', 1),
      strokeOpacity: number(raw.strokeOpacity, 'stroke-opacity', 1),
      strokeWidth: number(raw.strokeWidth, 'stroke-width', 1),
      opacity: number(raw.opacity, 'opacity', 1),
    };
    if (style.visibility === 'hidden' || (style.opacity ?? 1) <= 0) {
      skipped++;
      continue;
    }
    const subPaths = shapePath.subPaths;
    const hasFill =
      style.fill !== undefined && style.fill !== 'none' && (style.fillOpacity ?? 1) > 0;
    const hasStroke =
      style.stroke !== undefined &&
      style.stroke !== 'none' &&
      (style.strokeOpacity ?? 1) > 0 &&
      (style.strokeWidth ?? 0) > 0;
    const name = nodeName(node, index);

    if (hasFill) {
      const d = serializeSubPaths(subPaths.map((sub) => ({ curves: sub.curves, autoClose: true })));
      if (d && pathDataBounds(d)) {
        paths.push({
          id: `${idPrefix}${index++}`,
          name,
          d,
          fillRule: style.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
          sourceColor: `#${shapePath.color.getHexString(SRGBColorSpace)}`,
        });
      } else skipped++;
    }
    if (hasStroke) {
      const d = serializeSubPaths(
        subPaths.map((sub) => ({ curves: sub.curves, autoClose: sub.autoClose })),
      );
      if (d) {
        paths.push({
          id: `${idPrefix}${index++}`,
          name: `${name} stroke`,
          d,
          sourceColor: cssColor(style.stroke!),
          stroke: {
            width: style.strokeWidth!,
            join:
              style.strokeLineJoin === 'miter' || style.strokeLineJoin === 'miter-clip'
                ? 'miter'
                : style.strokeLineJoin === 'bevel'
                  ? 'bevel'
                  : 'round',
            cap:
              style.strokeLineCap === 'butt'
                ? 'butt'
                : style.strokeLineCap === 'square'
                  ? 'square'
                  : 'round',
          },
        });
      }
    }
    if (!hasFill && !hasStroke) skipped++;
    if (paths.length >= MAX_PATHS) break;
  }
  if (!paths.length)
    throw new SvgImportError('The SVG has no filled or stroked shapes to extrude.');
  return { viewBox: viewBoxOf(root, paths), paths, skipped };
}

function nodeName(node: Element | undefined, index: number): string {
  const label = node?.getAttribute?.('id') || node?.getAttribute?.('inkscape:label');
  if (label) return label.slice(0, 60);
  const tag = node?.nodeName?.toLowerCase();
  return `${tag && tag !== 'path' ? tag[0]!.toUpperCase() + tag.slice(1) : 'Path'} ${index + 1}`;
}

function cssColor(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(value))
    return `#${[...value.slice(1)].map((c) => c + c).join('')}`.toLowerCase();
  return '#ffffff';
}

function viewBoxOf(root: Element | null, paths: ImportedSvg['paths']): ImportedSvg['viewBox'] {
  const attr = root?.getAttribute?.('viewBox');
  const values = attr?.split(/[\s,]+/).map(Number);
  if (values?.length === 4 && values.every(Number.isFinite) && values[2]! > 0 && values[3]! > 0)
    return values as [number, number, number, number];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of paths) {
    const b = pathDataBounds(path.d);
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }
  return Number.isFinite(minX) ? [minX, minY, maxX - minX, maxY - minY] : [0, 0, 100, 100];
}
