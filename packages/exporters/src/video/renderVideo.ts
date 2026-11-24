import { Zip, ZipPassThrough } from 'fflate';
import type { ComposeCanvas } from '../image/renderImage.ts';

export type VideoFormat = 'mp4' | 'webm' | 'png';

export const VIDEO_MIME: Record<VideoFormat, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  png: 'application/zip',
};
export const VIDEO_EXTENSION: Record<VideoFormat, string> = {
  mp4: 'mp4',
  webm: 'webm',
  png: 'zip',
};

export interface RenderVideoOptions {
  width: number;
  height: number;
  fps: number;
  /** Number of frames; frame `i` shows time `i / fps`. */
  frames: number;
  format: VideoFormat;
  /** Keep transparency (WebM VP9 with alpha, PNG sequence). */
  alpha?: boolean;
  /** Bits per second; defaults to a high-quality rate for the size. */
  bitrate?: number;
  /** The canvas frames are drawn into (its size must be width × height). */
  canvas: ComposeCanvas;
  /** Draws frame `index` (time in seconds) into `canvas`. Awaited before encoding. */
  drawFrame: (index: number, time: number) => Promise<void>;
  /** Encodes a PNG (PNG sequences only). */
  encodePng?: (canvas: ComposeCanvas) => Promise<Blob>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface RenderedVideo {
  blob: Blob;
  format: VideoFormat;
  codec: string;
  frames: number;
  width: number;
  height: number;
}

export class VideoUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VideoUnsupportedError';
  }
}

/** H.264 and VP9 need even dimensions (4:2:0 chroma). */
export const evenSize = (width: number, height: number): { width: number; height: number } => ({
  width: Math.max(2, Math.round(width / 2) * 2),
  height: Math.max(2, Math.round(height / 2) * 2),
});

/** A sensible default bitrate: ~0.2 bits per pixel per frame at 30 fps, at least 4 Mb/s. */
export const defaultBitrate = (width: number, height: number, fps: number): number =>
  Math.round(Math.max(4e6, Math.min(80e6, width * height * fps * 0.2)));

const CODECS: Record<Exclude<VideoFormat, 'png'>, ('avc' | 'hevc' | 'vp9' | 'vp8' | 'av1')[]> = {
  mp4: ['avc', 'hevc', 'av1'],
  webm: ['vp9', 'vp8', 'av1'],
};

/** Which video formats this browser can encode at this size (PNG always works). */
export async function videoSupport(
  width: number,
  height: number,
): Promise<Record<VideoFormat, boolean> & { webmAlpha: boolean }> {
  if (typeof VideoEncoder === 'undefined')
    return { mp4: false, webm: false, png: true, webmAlpha: false };
  const { canEncodeVideo } = await import('mediabunny');
  const size = evenSize(width, height);
  const can = async (codecs: readonly string[], alpha = false) => {
    for (const codec of codecs)
      if (
        await canEncodeVideo(codec as 'avc', {
          ...size,
          ...(alpha ? { alpha: 'keep' as const } : {}),
        }).catch(() => false)
      )
        return true;
    return false;
  };
  return {
    mp4: await can(CODECS.mp4),
    webm: await can(CODECS.webm),
    png: true,
    webmAlpha: await can(['vp9'], true),
  };
}

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function renderPngSequence(options: RenderVideoOptions): Promise<RenderedVideo> {
  const { frames, fps, canvas, signal } = options;
  const encode =
    options.encodePng ??
    ((target: ComposeCanvas) => {
      const c = target as unknown as OffscreenCanvas | HTMLCanvasElement;
      if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/png' });
      return new Promise<Blob>((resolve, reject) =>
        (c as HTMLCanvasElement).toBlob(
          (b) => (b ? resolve(b) : reject(new Error('PNG failed'))),
          'image/png',
        ),
      );
    });
  const chunks: Uint8Array[] = [];
  let failure: unknown = null;
  const zip = new Zip((error, chunk) => {
    if (error) failure = error;
    else chunks.push(chunk);
  });
  const digits = Math.max(4, String(frames - 1).length);
  for (let i = 0; i < frames; i++) {
    signal?.throwIfAborted();
    await options.drawFrame(i, i / fps);
    const png = new Uint8Array(await (await encode(canvas)).arrayBuffer());
    // PNGs are already compressed: store them.
    const entry = new ZipPassThrough(`frame_${String(i).padStart(digits, '0')}.png`);
    zip.add(entry);
    entry.push(png, true);
    options.onProgress?.(i + 1, frames);
    if (failure) throw failure;
    await nextTask();
  }
  zip.end();
  if (failure) throw failure;
  return {
    blob: new Blob(chunks as BlobPart[], { type: VIDEO_MIME.png }),
    format: 'png',
    codec: 'png',
    frames,
    width: options.width,
    height: options.height,
  };
}

/**
 * Renders a video frame by frame. Each frame is drawn by the host for an exact time
 * (deterministic stepping), then encoded with WebCodecs and muxed with Mediabunny, so the
 * output never depends on how fast the machine renders.
 */
export async function renderVideo(options: RenderVideoOptions): Promise<RenderedVideo> {
  if (options.format === 'png') return renderPngSequence(options);
  const { width, height, fps, frames, format, signal } = options;
  if (width % 2 || height % 2) throw new Error('Video dimensions must be even.');
  if (typeof VideoEncoder === 'undefined')
    throw new VideoUnsupportedError('This browser cannot encode video (WebCodecs is missing).');
  const mediabunny = await import('mediabunny');
  const alpha = format === 'webm' && !!options.alpha;
  let codec: string | null = null;
  for (const candidate of alpha ? (['vp9'] as const) : CODECS[format]) {
    if (
      await mediabunny
        .canEncodeVideo(candidate, { width, height, ...(alpha ? { alpha: 'keep' as const } : {}) })
        .catch(() => false)
    ) {
      codec = candidate;
      break;
    }
  }
  if (!codec)
    throw new VideoUnsupportedError(
      `This browser cannot encode ${format.toUpperCase()}${alpha ? ' with transparency' : ''} at ${width} × ${height}. Try another format or a PNG sequence.`,
    );

  const target = new mediabunny.BufferTarget();
  const output = new mediabunny.Output({
    format:
      format === 'mp4'
        ? new mediabunny.Mp4OutputFormat({ fastStart: 'in-memory' })
        : new mediabunny.WebMOutputFormat(),
    target,
  });
  const source = new mediabunny.CanvasSource(options.canvas as unknown as OffscreenCanvas, {
    codec: codec as 'avc',
    bitrate: options.bitrate ?? defaultBitrate(width, height, fps),
    ...(alpha ? { alpha: 'keep' as const } : {}),
    // A keyframe every second keeps scrubbing smooth in editors.
    keyFrameInterval: 1,
    latencyMode: 'quality',
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();
  try {
    for (let i = 0; i < frames; i++) {
      signal?.throwIfAborted();
      await options.drawFrame(i, i / fps);
      await source.add(i / fps, 1 / fps);
      options.onProgress?.(i + 1, frames);
    }
    source.close();
    await output.finalize();
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  }
  const buffer = target.buffer;
  if (!buffer) throw new Error('The video encoder produced no data.');
  return {
    blob: new Blob([buffer], { type: VIDEO_MIME[format] }),
    format,
    codec,
    frames,
    width,
    height,
  };
}
