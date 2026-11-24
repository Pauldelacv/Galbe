import type { Object3D, Scene } from 'three';
import { controller, viewport } from './studioEngine.ts';

/**
 * Hides everything in the scene that is not part of the artwork (gizmos, helpers added by
 * the editor) and returns a function that restores it. Used for exports and thumbnails.
 */
export function hideEditorHelpers(scene: Scene): () => void {
  const artwork = new Set<Object3D>([
    controller.content,
    controller.contactShadows.object,
    controller.reflection.object,
    controller.lights.object,
  ]);
  const hidden = scene.children.filter((child) => !artwork.has(child) && child.visible);
  for (const child of hidden) child.visible = false;
  return () => {
    for (const child of hidden) child.visible = true;
  };
}

/** Draws the scene through the effect stack when one is active (tile-aware). */
export function drawWithEffects(
  renderer: import('three').WebGLRenderer,
  scene: Scene,
  camera: import('three').Camera,
  view?: { tile: { renderX: number; renderY: number }; full: { width: number; height: number } },
): void {
  const post = viewport.post;
  if (post?.active) {
    post.render(
      scene,
      camera,
      view && {
        fullWidth: view.full.width,
        fullHeight: view.full.height,
        offsetX: view.tile.renderX,
        offsetY: view.tile.renderY,
      },
    );
  } else renderer.render(scene, camera);
}
