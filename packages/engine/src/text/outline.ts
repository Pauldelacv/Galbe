import * as clipperModule from 'clipper-lib';
import type { PathCommand } from 'opentype.js';
import { Path, Shape, Vector2 } from 'three';

// clipper-lib is CommonJS (`module.exports = ClipperLib`): depending on the bundler the
// namespace holds the API directly or under `default`.
const ClipperLib = ((clipperModule as unknown as { default?: typeof clipperModule }).default ??
  clipperModule) as typeof clipperModule;

/** Integer grid used for the boolean union (font units × 16). */
const GRID = 16;

/** Converts font-unit, y-up path commands to `THREE.Path` contours (one per subpath). */
export function commandsToPaths(commands: PathCommand[], scale = 1): Path[] {
  const paths: Path[] = [];
  let current: Path | null = null;
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        current = new Path();
        current.moveTo(command.x * scale, command.y * scale);
        paths.push(current);
        break;
      case 'L':
        current?.lineTo(command.x * scale, command.y * scale);
        break;
      case 'Q':
        current?.quadraticCurveTo(
          command.x1 * scale,
          command.y1 * scale,
          command.x * scale,
          command.y * scale,
        );
        break;
      case 'C':
        current?.bezierCurveTo(
          command.x1 * scale,
          command.y1 * scale,
          command.x2 * scale,
          command.y2 * scale,
          command.x * scale,
          command.y * scale,
        );
        break;
      case 'Z':
        current = null;
        break;
    }
  }
  return paths;
}

/**
 * Turns a glyph outline into extrudable shapes with holes.
 *
 * Fonts may contain overlapping or self-intersecting contours (common in static instances
 * of variable fonts), which must be filled with the non-zero winding rule. Contours are
 * flattened (`curveSegments` points per curve) and merged with a boolean union (Clipper,
 * non-zero fill), which also resolves holes and islands, for TrueType and CFF alike.
 */
export function glyphShapes(commands: PathCommand[], scale: number, curveSegments = 8): Shape[] {
  const subject = commandsToPaths(commands)
    .map((path) => {
      const points = path.getPoints(curveSegments);
      if (points.length > 1 && points[0]!.equals(points.at(-1)!)) points.pop();
      return points.map((point) => ({
        X: Math.round(point.x * GRID),
        Y: Math.round(point.y * GRID),
      }));
    })
    .filter((points) => points.length >= 3);
  if (!subject.length) return [];

  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    tree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero,
  );

  const factor = scale / GRID;
  const toVectors = (contour: { X: number; Y: number }[]) =>
    contour.map((p) => new Vector2(p.X * factor, p.Y * factor));
  const shapes: Shape[] = [];
  const visit = (node: ReturnType<typeof tree.Childs>[number]) => {
    // Outer contour: a shape whose children are its holes; holes' children are islands.
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
