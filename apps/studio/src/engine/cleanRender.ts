import type { Object3D, Scene } from 'three';
import { controller } from './studioEngine.ts';

/**
 * Hides everything in the scene that is not part of the artwork (gizmos, helpers added by
 * the editor) and returns a function that restores it. Used for exports and thumbnails.
 */
export function hideEditorHelpers(scene: Scene): () => void {
  const artwork = new Set<Object3D>([
    controller.content,
    controller.contactShadows.object,
    controller.lights.object,
  ]);
  const hidden = scene.children.filter((child) => !artwork.has(child) && child.visible);
  for (const child of hidden) child.visible = false;
  return () => {
    for (const child of hidden) child.visible = true;
  };
}
