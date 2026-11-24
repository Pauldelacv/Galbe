import { planTiles, type Size, type Tile } from './tiles.ts';

export type ImageFormat = 'png' | 'jpeg' | 'webp';

export const IMAGE_MIME: Record<ImageFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export const supportsAlpha = (format: ImageFormat): boolean => format !== 'jpeg';

/** The subset of a 2D canvas the composer needs (lets tests use fakes). */
export interface ComposeCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): ComposeContext | null;
}
export interface ComposeContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect?(x: number, y: number, w: number, h: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
}

export interface RenderImageOptions extends Size {
  format: ImageFormat;
  /** 0–1, for JPEG and WebP. */
  quality?: number;
  /** Colour painted under the image. Required for an opaque result; ignored if null. */
  background?: string | null;
  /** Largest tile side the renderer can produce (see `gpuTileLimit`). */
  maxTileSize: number;
  /** Overlap rendered around each tile and cropped away. */
  padding?: number;
  /**
   * Renders the padded tile region and passes an image of exactly
   * `tile.renderWidth × tile.renderHeight` to `draw`, synchronously while it is valid (so a
   * WebGL canvas without `preserveDrawingBuffer` works), then restores its own state.
   */
  renderTile: (
    tile: Tile,
    full: Size,
    draw: (image: CanvasImageSource) => void,
  ) => void | Promise<void>;
  createCanvas?: (width: number, height: number) => ComposeCanvas;
  encode?: (canvas: ComposeCanvas, mime: string, quality?: number) => Promise<Blob>;
  /** Draws on top of the composed render (2D overlays). */
  afterCompose?: (context: ComposeContext, size: Size) => void | Promise<void>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface RenderedImage {
  blob: Blob;
  width: number;
  height: number;
  tiles: number;
  /** False when the browser silently encoded another format (e.g. WebP unsupported). */
  formatHonoured: boolean;
}

export function defaultCanvas(width: number, height: number): ComposeCanvas {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height) as unknown as ComposeCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas as unknown as ComposeCanvas;
}

async function defaultEncode(canvas: ComposeCanvas, mime: string, quality?: number): Promise<Blob> {
  const c = canvas as unknown as OffscreenCanvas | HTMLCanvasElement;
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

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface ComposeOptions extends Size {
  /** Colour painted under the image, or null for transparency. */
  fill: string | null;
  maxTileSize: number;
  padding?: number;
  renderTile: RenderImageOptions['renderTile'];
  /** Canvas to draw into (reused across video frames); created when absent. */
  canvas?: ComposeCanvas;
  createCanvas?: (width: number, height: number) => ComposeCanvas;
  /** Draws on top of the composed render (2D overlays). */
  afterCompose?: (context: ComposeContext, size: Size) => void | Promise<void>;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  /** Yield to the browser between tiles (keeps the UI responsive for big images). */
  yieldBetweenTiles?: boolean;
}

/** Composes GPU-sized tiles (plus overlays) into one canvas of the full size. */
export async function composeImage(
  options: ComposeOptions,
): Promise<{ canvas: ComposeCanvas; tiles: number }> {
  const { width, height, fill, maxTileSize, padding = 32, renderTile, signal } = options;
  const tiles = planTiles({ width, height }, maxTileSize, padding);
  const canvas = options.canvas ?? (options.createCanvas ?? defaultCanvas)(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a 2D canvas for composing the image.');
  context.clearRect?.(0, 0, width, height);
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
  }
  for (const tile of tiles) {
    signal?.throwIfAborted();
    let drawn = false;
    await renderTile(tile, { width, height }, (image) => {
      context.drawImage(
        image,
        tile.x - tile.renderX,
        tile.y - tile.renderY,
        tile.width,
        tile.height,
        tile.x,
        tile.y,
        tile.width,
        tile.height,
      );
      drawn = true;
    });
    if (!drawn) throw new Error(`Tile ${tile.index + 1}/${tiles.length} was not drawn.`);
    options.onProgress?.(tile.index + 1, tiles.length);
    if (tiles.length > 1 && (options.yieldBetweenTiles ?? true)) await nextTask();
  }
  signal?.throwIfAborted();
  await options.afterCompose?.(context, { width, height });
  return { canvas, tiles: tiles.length };
}

/** Renders an image of any size by composing GPU-sized tiles, then encodes it. */
export async function renderImage(options: RenderImageOptions): Promise<RenderedImage> {
  const { width, height, format, quality, background } = options;
  const encode = options.encode ?? defaultEncode;
  const { canvas, tiles } = await composeImage({
    width,
    height,
    fill: background ?? (supportsAlpha(format) ? null : '#ffffff'),
    maxTileSize: options.maxTileSize,
    renderTile: options.renderTile,
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.createCanvas ? { createCanvas: options.createCanvas } : {}),
    ...(options.afterCompose ? { afterCompose: options.afterCompose } : {}),
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const mime = IMAGE_MIME[format];
  const blob = await encode(canvas, mime, format === 'png' ? undefined : quality);
  return {
    blob,
    width,
    height,
    tiles,
    formatHonoured: blob.type === '' || blob.type === mime,
  };
}
