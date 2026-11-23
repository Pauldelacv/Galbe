import { type Camera, PerspectiveCamera, type Scene, Vector2, type WebGLRenderer } from 'three';
import type { Size, Tile } from './tiles.ts';

export interface ThreeTileRendererOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  /** Hook run before each tile (e.g. pre-passes, temporary background changes). */
  beforeRender?: (tile: Tile) => void;
  /** Custom draw call, e.g. a post-processing composer (v0.2). Defaults to renderer.render. */
  draw?: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void;
}

/**
 * A `renderTile` implementation for three.js: renders each tile into the renderer's own
 * canvas with `camera.setViewOffset`, then restores size, pixel ratio and camera so the
 * host's viewport is untouched between tiles.
 */
export function createThreeTileRenderer({
  renderer,
  scene,
  camera,
  beforeRender,
  draw,
}: ThreeTileRendererOptions) {
  return (tile: Tile, full: Size, present: (image: CanvasImageSource) => void): void => {
    const size = renderer.getSize(new Vector2());
    const pixelRatio = renderer.getPixelRatio();
    const perspective = camera instanceof PerspectiveCamera ? camera : null;
    const aspect = perspective?.aspect;
    const view = perspective?.view ? { ...perspective.view } : null;

    try {
      renderer.setPixelRatio(1);
      renderer.setSize(tile.renderWidth, tile.renderHeight, false);
      if (perspective) {
        perspective.aspect = full.width / full.height;
        perspective.setViewOffset(
          full.width,
          full.height,
          tile.renderX,
          tile.renderY,
          tile.renderWidth,
          tile.renderHeight,
        );
        perspective.updateProjectionMatrix();
      }
      beforeRender?.(tile);
      (draw ?? ((r, s, c) => r.render(s, c)))(renderer, scene, camera);
      // Copy while the drawing buffer is still valid (same task, before any resize).
      present(renderer.domElement);
    } finally {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(size.x, size.y, false);
      if (perspective) {
        if (view?.enabled) {
          perspective.setViewOffset(
            view.fullWidth,
            view.fullHeight,
            view.offsetX,
            view.offsetY,
            view.width,
            view.height,
          );
        } else perspective.clearViewOffset();
        if (aspect !== undefined) perspective.aspect = aspect;
        perspective.updateProjectionMatrix();
      }
    }
  };
}
