import { describe, expect, it } from 'vitest';
import { planTiles, scaledSize } from '../src/index.ts';

function coverage(width: number, height: number, max: number, padding: number) {
  const tiles = planTiles({ width, height }, max, padding);
  const hits = new Uint8Array(width * height);
  for (const tile of tiles) {
    expect(tile.renderWidth).toBeLessThanOrEqual(max);
    expect(tile.renderHeight).toBeLessThanOrEqual(max);
    expect(tile.renderX).toBeLessThanOrEqual(tile.x);
    expect(tile.renderY).toBeLessThanOrEqual(tile.y);
    expect(tile.renderX + tile.renderWidth).toBeGreaterThanOrEqual(tile.x + tile.width);
    expect(tile.renderY + tile.renderHeight).toBeGreaterThanOrEqual(tile.y + tile.height);
    expect(tile.renderX + tile.renderWidth).toBeLessThanOrEqual(width);
    for (let y = tile.y; y < tile.y + tile.height; y++) {
      for (let x = tile.x; x < tile.x + tile.width; x++) hits[y * width + x]!++;
    }
  }
  return { tiles, hits };
}

describe('planTiles', () => {
  it('uses a single unpadded tile when the image fits', () => {
    const tiles = planTiles({ width: 1080, height: 1350 }, 4096, 32);
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toMatchObject({
      x: 0,
      y: 0,
      width: 1080,
      height: 1350,
      renderWidth: 1080,
      renderHeight: 1350,
    });
  });

  it.each([
    [7680, 4320, 4096, 32],
    [8192, 8192, 4096, 64],
    [1001, 37, 128, 8],
    [513, 513, 256, 0],
  ])('covers %i×%i exactly once (max %i, padding %i)', (w, h, max, pad) => {
    const { tiles, hits } = coverage(w, h, max, pad);
    expect(tiles.length).toBeGreaterThan(1);
    expect(hits.every((count) => count === 1)).toBe(true);
  });

  it('pads interior edges but not the image border', () => {
    const tiles = planTiles({ width: 200, height: 100 }, 120, 10);
    const first = tiles[0]!;
    expect(first.renderX).toBe(0);
    expect(first.renderWidth).toBe(first.width + 10);
  });

  it('rejects impossible configurations', () => {
    expect(() => planTiles({ width: 0, height: 10 }, 100)).toThrow(RangeError);
    expect(() => planTiles({ width: 100, height: 10 }, 20, 10)).toThrow(RangeError);
  });
});

describe('scaledSize', () => {
  it('scales the base frame', () => {
    expect(scaledSize({ width: 1080, height: 1920 }, 2)).toEqual({
      width: 2160,
      height: 3840,
      scale: 2,
    });
  });

  it('clamps the long side to 8K', () => {
    const size = scaledSize({ width: 1920, height: 1080 }, 8);
    expect(size.width).toBe(8192);
    expect(size.height).toBe(4608);
  });
});
