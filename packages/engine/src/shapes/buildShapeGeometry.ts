import type { ShapeNode, ShapePath } from '@galbe/core';
import * as clipperModule from 'clipper-lib';
import { Path, Shape, Vector2 } from 'three';
import { deformSoup, hasActiveDeform } from '../geometry/deform.ts';
import { type TriangleSoup, translateSoup } from '../geometry/soup.ts';
import { DEFAULT_CREASE_ANGLE } from '../text/buildTextGeometry.ts';
import { extrudeShapes } from '../text/glyphGeometry.ts';
import { parsePathData } from './svgPath.ts';

const ClipperLib = ((clipperModule as unknown as { default?: typeof clipperModule }).default ??
  clipperModule) as typeof clipperModule;

/** Integer grid for Clipper, in scene units. */
const GRID = 10_000;

type IntPoint = { X: number; Y: number };
type PolyNode = ReturnType<InstanceType<typeof ClipperLib.PolyTree>['Childs']>[number];

export interface ShapeLayout {
  /** Scene units per SVG unit. */
  scale: number;
  /** SVG-space centre of the artwork. */
  center: [number, number];
  width: number;
  height: number;
}

/** Fits the artwork so its longest side is `node.size`, centred on the origin. */
export function shapeLayout(
  node: Pick<ShapeNode, 'paths' | 'viewBox' | 'size' | 'curveSegments'>,
): ShapeLayout {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of node.paths) {
    if (!path.visible) continue;
    const pad = path.stroke ? path.stroke.width / 2 : 0;
    for (const sub of parsePathData(path.d)) {
      for (const p of sub.path.getPoints(4)) {
        minX = Math.min(minX, p.x - pad);
        minY = Math.min(minY, p.y - pad);
        maxX = Math.max(maxX, p.x + pad);
        maxY = Math.max(maxY, p.y + pad);
      }
    }
  }
  if (!Number.isFinite(minX)) {
    const [x, y, w, h] = node.viewBox;
    minX = x;
    minY = y;
    maxX = x + w;
    maxY = y + h;
  }
  const w = Math.max(maxX - minX, 1e-6);
  const h = Math.max(maxY - minY, 1e-6);
  const scale = node.size / Math.max(w, h);
  return {
    scale,
    center: [(minX + maxX) / 2, (minY + maxY) / 2],
    width: w * scale,
    height: h * scale,
  };
}

function polygonsOf(path: ShapePath, layout: ShapeLayout, curveSegments: number) {
  const k = layout.scale * GRID;
  const [cx, cy] = layout.center;
  return parsePathData(path.d)
    .map((sub) => {
      const points = sub.path.getPoints(curveSegments);
      if (points.length > 1 && points[0]!.distanceTo(points.at(-1)!) < 1e-9) {
        points.pop();
        sub.closed = true;
      }
      // SVG is y-down; scenes are y-up.
      return {
        closed: sub.closed,
        points: points.map((p) => ({
          X: Math.round((p.x - cx) * k),
          Y: Math.round(-(p.y - cy) * k),
        })),
      };
    })
    .filter((sub) => sub.points.length >= 2);
}

function treeToShapes(tree: InstanceType<typeof ClipperLib.PolyTree>): Shape[] {
  const toVectors = (contour: IntPoint[]) =>
    contour.map((p) => new Vector2(p.X / GRID, p.Y / GRID));
  const shapes: Shape[] = [];
  const visit = (node: PolyNode) => {
    const shape = new Shape(toVectors(node.Contour()));
    for (const hole of node.Childs()) {
      shape.holes.push(new Path(toVectors(hole.Contour())));
      for (const island of hole.Childs()) visit(island);
    }
    shapes.push(shape);
  };
  for (const node of tree.Childs()) visit(node);
  return shapes;
}

const JOIN = { miter: 'jtMiter', round: 'jtRound', bevel: 'jtSquare' } as const;
const CAP = { butt: 'etOpenButt', round: 'etOpenRound', square: 'etOpenSquare' } as const;

/** Flat shapes (holes resolved) of one path, in scene units, centred on the artwork. */
export function pathShapes(path: ShapePath, layout: ShapeLayout, curveSegments = 8): Shape[] {
  const polygons = polygonsOf(path, layout, curveSegments);
  if (!polygons.length) return [];
  const tree = new ClipperLib.PolyTree();
  if (path.stroke) {
    const offset = new ClipperLib.ClipperOffset(2, 0.25 * GRID * 0.01);
    const join = ClipperLib.JoinType[JOIN[path.stroke.join]];
    for (const polygon of polygons) {
      const end = polygon.closed
        ? ClipperLib.EndType.etClosedLine
        : ClipperLib.EndType[CAP[path.stroke.cap]];
      offset.AddPath(polygon.points, join, end);
    }
    offset.Execute(tree, (path.stroke.width / 2) * layout.scale * GRID);
    // Union the offset result so overlapping stroke pieces merge cleanly.
    const paths = ClipperLib.Clipper.PolyTreeToPaths(tree);
    const merged = new ClipperLib.PolyTree();
    const clipper = new ClipperLib.Clipper();
    clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
    clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      merged,
      ClipperLib.PolyFillType.pftNonZero,
      ClipperLib.PolyFillType.pftNonZero,
    );
    return treeToShapes(merged);
  }
  const fill =
    path.fillRule === 'evenodd'
      ? ClipperLib.PolyFillType.pftEvenOdd
      : ClipperLib.PolyFillType.pftNonZero;
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(
    polygons.filter((p) => p.points.length >= 3).map((p) => p.points),
    ClipperLib.PolyType.ptSubject,
    true,
  );
  clipper.Execute(ClipperLib.ClipType.ctUnion, tree, fill, fill);
  return treeToShapes(tree);
}

export type ShapeGeometryParams = Pick<
  ShapeNode,
  'paths' | 'viewBox' | 'size' | 'depth' | 'curveSegments' | 'bevel' | 'layerSpacing' | 'deform'
>;

export interface ShapePartSoup {
  pathId: string;
  soup: TriangleSoup;
}

/** One extruded soup per visible path, stacked along Z in document order. */
export function buildShapeSoups(params: ShapeGeometryParams): ShapePartSoup[] {
  const layout = shapeLayout(params);
  const out: ShapePartSoup[] = [];
  const visible = params.paths.filter((path) => path.visible);
  const stack = (visible.length - 1) * params.layerSpacing;
  visible.forEach((path, index) => {
    const shapes = pathShapes(path, layout, params.curveSegments);
    const depth = params.depth * path.depthScale;
    // Bevels larger than half the depth would turn inside out on thin layers.
    const bevelThickness = Math.min(params.bevel.thickness, depth / 2 + params.bevel.thickness / 2);
    let soup = extrudeShapes(shapes, {
      size: 1,
      depth,
      curveSegments: params.curveSegments,
      bevel: { ...params.bevel, thickness: bevelThickness },
      creaseAngle: DEFAULT_CREASE_ANGLE,
    });
    if (!soup) return;
    translateSoup(soup, 0, 0, index * params.layerSpacing - stack / 2);
    soup.part.fill(index);
    if (hasActiveDeform(params.deform)) soup = deformSoup(soup, params.deform, layout.width);
    out.push({ pathId: path.id, soup });
  });
  return out;
}

// Path data can be large: intern it so build keys stay short.
const pathDataIds = new Map<string, number>();
let nextPathDataId = 1;
const internPathData = (d: string): number => {
  let id = pathDataIds.get(d);
  if (id === undefined) {
    if (pathDataIds.size > 20_000) pathDataIds.clear();
    id = nextPathDataId++;
    pathDataIds.set(d, id);
  }
  return id;
};

/** Cache key for everything that affects the shape meshes (not their materials). */
export const shapeBuildKey = (p: ShapeGeometryParams): string =>
  JSON.stringify([
    p.paths.map((path) => [
      path.id,
      internPathData(path.d),
      path.fillRule,
      path.stroke,
      path.visible,
      path.depthScale,
    ]),
    p.viewBox,
    p.size,
    p.depth,
    p.curveSegments,
    p.bevel,
    p.layerSpacing,
    p.deform,
  ]);
