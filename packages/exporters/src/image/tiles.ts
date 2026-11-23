export interface Size {
  width: number;
  height: number;
}

/**
 * A tile of the output image. `x/y/width/height` is the region the tile contributes;
 * `render*` is the (larger) region actually rendered, padded so that screen-space effects
 * (blur, refraction, bloom) near tile borders see their neighbours and leave no seams.
 */
export interface Tile {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  renderX: number;
  renderY: number;
  renderWidth: number;
  renderHeight: number;
}

/**
 * Splits `width × height` into tiles whose padded size never exceeds `maxSize`.
 * Tiles are row-major, cover every pixel exactly once and are as even as possible.
 */
export function planTiles({ width, height }: Size, maxSize: number, padding = 0): Tile[] {
  if (width < 1 || height < 1) throw new RangeError('Image size must be at least 1×1.');
  const single = width <= maxSize && height <= maxSize;
  if (!single && maxSize <= 2 * padding)
    throw new RangeError('Tile size must exceed twice the padding.');
  const pad = single ? 0 : padding;
  const inner = maxSize - 2 * pad;
  const columns = Math.ceil(width / inner);
  const rows = Math.ceil(height / inner);
  const tiles: Tile[] = [];
  for (let row = 0; row < rows; row++) {
    const y0 = Math.round((row * height) / rows);
    const y1 = Math.round(((row + 1) * height) / rows);
    for (let column = 0; column < columns; column++) {
      const x0 = Math.round((column * width) / columns);
      const x1 = Math.round(((column + 1) * width) / columns);
      const renderX = Math.max(0, x0 - pad);
      const renderY = Math.max(0, y0 - pad);
      tiles.push({
        index: tiles.length,
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
        renderX,
        renderY,
        renderWidth: Math.min(width, x1 + pad) - renderX,
        renderHeight: Math.min(height, y1 + pad) - renderY,
      });
    }
  }
  return tiles;
}

/** Output size for a base frame size and a scale, clamped so the long side ≤ `maxSide`. */
export function scaledSize(base: Size, scale: number, maxSide = 8192): Size & { scale: number } {
  const longSide = Math.max(base.width, base.height);
  const effective = Math.min(scale, maxSide / longSide);
  return {
    width: Math.max(1, Math.round(base.width * effective)),
    height: Math.max(1, Math.round(base.height * effective)),
    scale: effective,
  };
}

/** Largest tile a WebGL context can render into (drawing buffer, viewport, renderbuffer). */
export function gpuTileLimit(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  cap = 4096,
): number {
  const texture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const renderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number;
  const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  return Math.min(cap, texture, renderbuffer, viewport[0] ?? cap, viewport[1] ?? cap);
}
