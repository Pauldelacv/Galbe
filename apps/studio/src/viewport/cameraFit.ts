import type { Vec3 } from '@galbe/core';
import { type Box3, Sphere, Vector3 } from 'three';

/**
 * Camera position/target that frames `bounds`, keeping the current viewing direction.
 * Uses the narrower of the vertical and horizontal fields of view.
 */
export function frameBounds(
  bounds: Box3,
  camera: { position: Vec3; target: Vec3; fov: number },
  aspect: number,
  margin = 1.15,
): { position: Vec3; target: Vec3 } {
  const sphere = bounds.getBoundingSphere(new Sphere());
  const vertical = (camera.fov * Math.PI) / 180;
  const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect);
  const fov = Math.min(vertical, horizontal);
  const distance = (sphere.radius * margin) / Math.sin(fov / 2);
  const direction = new Vector3(...camera.position).sub(new Vector3(...camera.target));
  if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
  direction.normalize();
  const position = sphere.center.clone().addScaledVector(direction, distance);
  const round = (v: Vector3): Vec3 => [round4(v.x), round4(v.y), round4(v.z)];
  return { position: round(position), target: round(sphere.center) };
}

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/**
 * Moves the camera back along its viewing direction just enough for `bounds` to fit,
 * or returns null when it already fits (zoomed-in compositions are left alone otherwise).
 */
export function ensureVisible(
  bounds: Box3,
  camera: { position: Vec3; target: Vec3; fov: number },
  aspect: number,
): { position: Vec3; target: Vec3 } | null {
  const fit = frameBounds(bounds, camera, aspect, 1.08);
  const current = new Vector3(...camera.position).distanceTo(new Vector3(...camera.target));
  const needed = new Vector3(...fit.position).distanceTo(new Vector3(...fit.target));
  if (current >= needed) return null;
  const direction = new Vector3(...camera.position).sub(new Vector3(...camera.target)).normalize();
  const position = new Vector3(...camera.target).addScaledVector(direction, needed);
  return {
    position: [round4(position.x), round4(position.y), round4(position.z)],
    target: camera.target,
  };
}
