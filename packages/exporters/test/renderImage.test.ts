import { describe, expect, it, vi } from 'vitest';
import { type ComposeCanvas, type ComposeContext, renderImage } from '../src/index.ts';

function fakeCanvas() {
  const calls: { op: string; args: unknown[] }[] = [];
  const context: ComposeContext = {
    fillStyle: '',
    fillRect: (...args) => void calls.push({ op: 'fill', args: [context.fillStyle, ...args] }),
    drawImage: (...args: unknown[]) => void calls.push({ op: 'draw', args }),
  } as ComposeContext;
  const create = (width: number, height: number): ComposeCanvas => ({
    width,
    height,
    getContext: () => context,
  });
  return { calls, create };
}

const encode = vi.fn(
  async (_canvas: ComposeCanvas, mime: string) => new Blob(['x'], { type: mime }),
);

describe('renderImage', () => {
  it('draws the inner region of every padded tile', async () => {
    const { calls, create } = fakeCanvas();
    const progress: number[] = [];
    const result = await renderImage({
      width: 300,
      height: 100,
      format: 'png',
      maxTileSize: 128,
      padding: 8,
      createCanvas: create,
      encode,
      renderTile: (tile, _full, draw) => draw({ tile } as unknown as CanvasImageSource),
      onProgress: (done) => progress.push(done),
    });
    expect(result.tiles).toBe(3);
    expect(result.formatHonoured).toBe(true);
    const draws = calls.filter((call) => call.op === 'draw');
    expect(draws).toHaveLength(3);
    // Second tile starts at x=100 and was rendered from x=92 (8px padding).
    expect(draws[1]!.args.slice(1)).toEqual([8, 0, 100, 100, 100, 0, 100, 100]);
    expect(progress).toEqual([1, 2, 3]);
    expect(calls.some((call) => call.op === 'fill')).toBe(false);
  });

  it('fills JPEG backgrounds with white unless a colour is given', async () => {
    const { calls, create } = fakeCanvas();
    await renderImage({
      width: 10,
      height: 10,
      format: 'jpeg',
      quality: 0.9,
      maxTileSize: 64,
      createCanvas: create,
      encode,
      renderTile: (_tile, _full, draw) => draw({} as CanvasImageSource),
    });
    expect(calls[0]).toEqual({ op: 'fill', args: ['#ffffff', 0, 0, 10, 10] });
    expect(encode).toHaveBeenLastCalledWith(expect.anything(), 'image/jpeg', 0.9);
  });

  it('detects when the browser fell back to another format', async () => {
    const { create } = fakeCanvas();
    const result = await renderImage({
      width: 10,
      height: 10,
      format: 'webp',
      maxTileSize: 64,
      createCanvas: create,
      encode: async () => new Blob(['x'], { type: 'image/png' }),
      renderTile: (_tile, _full, draw) => draw({} as CanvasImageSource),
    });
    expect(result.formatHonoured).toBe(false);
  });

  it('fails if a tile is never drawn, and honours abort signals', async () => {
    const { create } = fakeCanvas();
    await expect(
      renderImage({
        width: 10,
        height: 10,
        format: 'png',
        maxTileSize: 64,
        createCanvas: create,
        encode,
        renderTile: () => {},
      }),
    ).rejects.toThrow(/not drawn/);
    const controller = new AbortController();
    controller.abort();
    await expect(
      renderImage({
        width: 10,
        height: 10,
        format: 'png',
        maxTileSize: 64,
        createCanvas: create,
        encode,
        signal: controller.signal,
        renderTile: (_tile, _full, draw) => draw({} as CanvasImageSource),
      }),
    ).rejects.toThrow();
  });
});
