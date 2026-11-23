import type { PathCommand } from 'opentype.js';
import { Path, Shape, ShapeUtils, type Vector2 } from 'three';

interface Contour {
  path: Path;
  points: Vector2[];
  area: number;
}

function pointInPolygon(x: number, y: number, polygon: Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Converts font-unit, y-up path commands to contours scaled to scene units. */
export function commandsToContours(commands: PathCommand[], scale: number): Contour[] {
  const contours: Contour[] = [];
  let current: Path | null = null;
  const flush = () => {
    if (!current) return;
    const points = current.getPoints(4);
    // Drop the duplicated closing point for area/containment computations.
    if (points.length > 1 && points[0]!.equals(points.at(-1)!)) points.pop();
    if (points.length >= 3) {
      const area = ShapeUtils.area(points);
      if (Math.abs(area) > 1e-12) contours.push({ path: current, points, area });
    }
    current = null;
  };
  for (const command of commands) {
    switch (command.type) {
      case 'M':
        flush();
        current = new Path();
        current.moveTo(command.x * scale, command.y * scale);
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
        flush();
        break;
    }
  }
  flush();
  return contours;
}

/**
 * Groups contours into shapes with holes. Solids are the contours whose winding matches
 * the glyph's largest contour (TrueType and CFF use opposite conventions, so we never
 * assume one). Each hole is attached to the smallest solid that contains it.
 */
export function contoursToShapes(contours: Contour[]): Shape[] {
  if (!contours.length) return [];
  const largest = contours.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const solidSign = Math.sign(largest.area);
  const solids = contours.filter((contour) => Math.sign(contour.area) === solidSign);
  const holes = contours.filter((contour) => Math.sign(contour.area) !== solidSign);

  const shapes = new Map<Contour, Shape>();
  for (const solid of solids) {
    const shape = new Shape();
    shape.curves = solid.path.curves;
    shape.currentPoint.copy(solid.path.currentPoint);
    shapes.set(solid, shape);
  }
  for (const hole of holes) {
    const probe = hole.points[0]!;
    const parent = solids
      .filter((solid) => pointInPolygon(probe.x, probe.y, solid.points))
      .sort((a, b) => Math.abs(a.area) - Math.abs(b.area))[0];
    if (parent) {
      shapes.get(parent)!.holes.push(hole.path);
    } else {
      // A hole outside every solid means inconsistent winding: render it as a solid.
      const shape = new Shape();
      shape.curves = hole.path.curves;
      shapes.set(hole, shape);
    }
  }
  return [...shapes.values()];
}

export function glyphShapes(commands: PathCommand[], scale: number): Shape[] {
  return contoursToShapes(commandsToContours(commands, scale));
}
