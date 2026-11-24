import { frameCount } from '@galbe/core';
import {
  type ComposeCanvas,
  defaultCanvas,
  evenSize,
  type RenderedVideo,
  renderVideo,
  VIDEO_EXTENSION,
  type VideoFormat,
} from '@galbe/exporters';
import { refreshViewport } from '../../engine/frame.ts';
import { controller, requestRender } from '../../engine/studioEngine.ts';
import { downloadBlob, slugify } from '../../lib/files.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { usePlaybackStore } from '../../state/playbackStore.ts';
import { renderFrame } from './frameRenderer.ts';

export interface ExportVideoOptions {
  format: VideoFormat;
  /** Output size relative to the frame. */
  scale: number;
  transparent: boolean;
  /** Megabits per second (MP4/WebM). */
  bitrate?: number;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

/** Largest side encoders accept reliably (H.264 level 5.2 tops out near 4K). */
export const MAX_VIDEO_SIDE = 4096;

export function videoSize(frame: { width: number; height: number }, scale: number) {
  const fit = Math.min(1, MAX_VIDEO_SIDE / Math.max(frame.width * scale, frame.height * scale));
  return evenSize(frame.width * scale * fit, frame.height * scale * fit);
}

/** Renders the whole timeline frame by frame and downloads the video. */
export async function exportVideo(options: ExportVideoOptions): Promise<RenderedVideo> {
  const doc = useDocumentStore.getState().doc;
  const playback = usePlaybackStore.getState();
  if (playback.playing) playback.pause();
  const { fps } = doc.animation;
  const frames = frameCount(doc.animation);
  const size = videoSize(doc.frame, options.scale);
  const alpha = options.transparent && options.format !== 'mp4';
  const canvas: ComposeCanvas = defaultCanvas(size.width, size.height);
  controller.setPlaying(false);
  try {
    const result = await renderVideo({
      ...size,
      fps,
      frames,
      format: options.format,
      alpha,
      ...(options.bitrate ? { bitrate: options.bitrate * 1e6 } : {}),
      canvas,
      drawFrame: async (_index, time) => {
        await renderFrame(doc, time, {
          ...size,
          transparent: alpha,
          // Opaque formats get a solid base where nothing is drawn.
          fill: alpha ? null : '#000000',
          canvas,
          ...(options.signal ? { signal: options.signal } : {}),
        });
      },
      ...(options.onProgress ? { onProgress: options.onProgress } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
    });
    downloadBlob(
      result.blob,
      `${slugify(doc.name)}-${size.width}x${size.height}-${fps}fps.${VIDEO_EXTENSION[options.format]}`,
    );
    return result;
  } finally {
    refreshViewport();
    requestRender();
  }
}
