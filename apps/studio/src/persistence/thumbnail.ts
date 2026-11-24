import { createThreeTileRenderer, renderImage, scaledSize } from '@galbe/exporters';
import { drawWithEffects, hideEditorHelpers } from '../engine/cleanRender.ts';
import { controller, requestRender, viewport } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';

/** Renders a small preview of the current scene (for the project list and .galbe files). */
export async function renderThumbnail(
  longSide = 320,
  format: 'png' | 'webp' = 'webp',
): Promise<Blob | undefined> {
  const { gl, scene, camera } = viewport;
  if (!gl || !scene || !camera) return undefined;
  const frame = useDocumentStore.getState().doc.frame;
  const size = scaledSize(frame, longSide / Math.max(frame.width, frame.height));
  const restoreHelpers = hideEditorHelpers(scene);
  try {
    controller.prepareFrame(gl);
    const result = await renderImage({
      width: size.width,
      height: size.height,
      format,
      quality: 0.82,
      maxTileSize: 1024,
      renderTile: createThreeTileRenderer({ renderer: gl, scene, camera, draw: drawWithEffects }),
    });
    return result.blob;
  } catch (error) {
    console.warn('[galbe] thumbnail failed', error);
    return undefined;
  } finally {
    restoreHelpers();
    requestRender();
  }
}
