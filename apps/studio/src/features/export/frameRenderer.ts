import type { GalbeDocument } from '@galbe/core';
import { applyCameraSpec } from '@galbe/engine';
import {
  type ComposeCanvas,
  type ComposeContext,
  composeImage,
  createThreeTileRenderer,
  drawOverlays,
  gpuTileLimit,
  type OverlayContext,
} from '@galbe/exporters';
import type { PerspectiveCamera } from 'three';
import { drawWithEffects, hideEditorHelpers } from '../../engine/cleanRender.ts';
import { showFrame } from '../../engine/frame.ts';
import { controller, viewport } from '../../engine/studioEngine.ts';
import { overlayFontFamily, overlayFontsReady } from '../cover/overlayFonts.ts';

export interface FrameRenderOptions {
  width: number;
  height: number;
  /** No background at all (alpha), whatever the document's background is. */
  transparent: boolean;
  /** Opaque fill under the render (JPEG). */
  fill?: string | null;
  canvas?: ComposeCanvas;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** The viewport handles, or an error when the viewport is not mounted. */
export function viewportHandles() {
  const { gl, scene, camera } = viewport;
  if (!gl || !scene || !camera) throw new Error('The viewport is not ready yet.');
  return { gl, scene, camera: camera as PerspectiveCamera };
}

/**
 * Renders one frame of the document at `time`: scene (tiled beyond GPU limits), effects and
 * overlays, composed into a canvas. Helpers are hidden during the render. Everything is a
 * function of (document, time), so video frames are exact and reproducible.
 */
export async function renderFrame(
  doc: GalbeDocument,
  time: number,
  options: FrameRenderOptions,
): Promise<ComposeCanvas> {
  const { gl, scene, camera } = viewportHandles();
  let evaluated = showFrame(doc, time);
  await controller.whenReady();
  // Loads can change the scene (fonts, textures): show the frame again once settled.
  evaluated = showFrame(doc, time);
  await overlayFontsReady(evaluated.doc.overlays.filter((o) => o.visible).map((o) => o.font));
  applyCameraSpec(camera, evaluated.doc.camera);
  controller.prepareFrame(gl);

  const background = scene.background;
  const layerVisible = controller.background.mesh.visible;
  const restoreHelpers = hideEditorHelpers(scene);
  try {
    const { canvas } = await composeImage({
      width: options.width,
      height: options.height,
      fill: options.fill ?? null,
      maxTileSize: gpuTileLimit(gl.getContext()),
      // Screen-space effects read neighbouring pixels: pad tiles by their reach.
      padding: Math.max(
        48,
        Math.ceil(
          (viewport.post?.active ? viewport.post.support : 0) * (options.width / doc.frame.width),
        ),
      ),
      ...(options.canvas ? { canvas: options.canvas } : {}),
      renderTile: createThreeTileRenderer({
        renderer: gl,
        scene,
        camera,
        beforeRender: () => {
          if (options.transparent) {
            scene.background = null;
            controller.background.mesh.visible = false;
          }
        },
        draw: drawWithEffects,
      }),
      afterCompose: (context: ComposeContext, size) =>
        drawOverlays(
          context as unknown as OverlayContext,
          evaluated.doc.overlays,
          size,
          overlayFontFamily,
        ),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    return canvas;
  } finally {
    restoreHelpers();
    scene.background = background;
    controller.background.mesh.visible = layerVisible;
  }
}
