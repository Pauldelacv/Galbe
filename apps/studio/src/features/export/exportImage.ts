import { MAX_EXPORT_SIDE } from '@galbe/core';
import {
  createThreeTileRenderer,
  gpuTileLimit,
  type ImageFormat,
  type RenderedImage,
  renderImage,
  scaledSize,
} from '@galbe/exporters';
import { drawWithEffects, hideEditorHelpers } from '../../engine/cleanRender.ts';
import { controller, requestRender, viewport } from '../../engine/studioEngine.ts';
import { downloadBlob, slugify } from '../../lib/files.ts';
import { useDocumentStore } from '../../state/documentStore.ts';

export interface ExportImageOptions {
  format: ImageFormat;
  scale: number;
  transparent: boolean;
  quality: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export const EXTENSIONS: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

/** Renders the current frame at the requested size (tiled beyond GPU limits) and downloads it. */
export async function exportImage(options: ExportImageOptions): Promise<RenderedImage> {
  const { gl, scene, camera } = viewport;
  if (!gl || !scene || !camera) throw new Error('The viewport is not ready yet.');
  await controller.whenReady();

  const doc = useDocumentStore.getState().doc;
  const size = scaledSize(doc.frame, options.scale, MAX_EXPORT_SIDE);
  const maxTileSize = gpuTileLimit(gl.getContext());
  const background = scene.background;
  const transparent = options.transparent && options.format !== 'jpeg';

  controller.prepareFrame(gl);
  const restoreHelpers = hideEditorHelpers(scene);
  try {
    const result = await renderImage({
      width: size.width,
      height: size.height,
      format: options.format,
      quality: options.quality,
      maxTileSize,
      // Screen-space effects read neighbouring pixels: pad tiles by their reach.
      padding: Math.max(
        48,
        Math.ceil((viewport.post?.active ? viewport.post.support : 0) * options.scale),
      ),
      renderTile: createThreeTileRenderer({
        renderer: gl,
        scene,
        camera,
        beforeRender: () => {
          scene.background = transparent ? null : background;
        },
        draw: drawWithEffects,
      }),
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    downloadBlob(
      result.blob,
      `${slugify(doc.name)}-${size.width}x${size.height}.${EXTENSIONS[options.format]}`,
    );
    return result;
  } finally {
    restoreHelpers();
    scene.background = background;
    requestRender();
  }
}
