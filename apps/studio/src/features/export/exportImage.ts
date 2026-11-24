import { MAX_EXPORT_SIDE } from '@galbe/core';
import { IMAGE_MIME, type ImageFormat, type RenderedImage, scaledSize } from '@galbe/exporters';
import { refreshViewport } from '../../engine/frame.ts';
import { requestRender } from '../../engine/studioEngine.ts';
import { downloadBlob, slugify } from '../../lib/files.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { usePlaybackStore } from '../../state/playbackStore.ts';
import { renderFrame } from './frameRenderer.ts';

export interface ExportImageOptions {
  format: ImageFormat;
  scale: number;
  transparent: boolean;
  quality: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export const EXTENSIONS: Record<ImageFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp' };

async function encode(canvas: unknown, mime: string, quality?: number): Promise<Blob> {
  const c = canvas as OffscreenCanvas | HTMLCanvasElement;
  if ('convertToBlob' in c)
    return c.convertToBlob({ type: mime, ...(quality !== undefined ? { quality } : {}) });
  return new Promise((resolve, reject) =>
    (c as HTMLCanvasElement).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Encoding failed'))),
      mime,
      quality,
    ),
  );
}

/** Renders the frame at the playhead at the requested size (tiled) and downloads it. */
export async function exportImage(options: ExportImageOptions): Promise<RenderedImage> {
  const doc = useDocumentStore.getState().doc;
  const playback = usePlaybackStore.getState();
  if (playback.playing) playback.pause();
  const size = scaledSize(doc.frame, options.scale, MAX_EXPORT_SIDE);
  const transparent = options.transparent && options.format !== 'jpeg';
  let tiles = 1;
  try {
    const canvas = await renderFrame(doc, usePlaybackStore.getState().time, {
      width: size.width,
      height: size.height,
      transparent,
      fill: options.format === 'jpeg' ? '#ffffff' : null,
      onProgress: (done, total) => {
        tiles = total;
        options.onProgress?.(done, total);
      },
      ...(options.signal ? { signal: options.signal } : {}),
    });
    const mime = IMAGE_MIME[options.format];
    const blob = await encode(canvas, mime, options.format === 'png' ? undefined : options.quality);
    downloadBlob(
      blob,
      `${slugify(doc.name)}-${size.width}x${size.height}.${EXTENSIONS[options.format]}`,
    );
    return {
      blob,
      width: size.width,
      height: size.height,
      tiles,
      formatHonoured: blob.type === '' || blob.type === mime,
    };
  } finally {
    refreshViewport();
    requestRender();
  }
}
