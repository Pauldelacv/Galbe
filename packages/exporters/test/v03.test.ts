import { createOverlay } from '@galbe/core';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  type ComposeCanvas,
  composeImage,
  defaultBitrate,
  drawOverlays,
  evenSize,
  layoutOverlay,
  type OverlayContext,
  renderVideo,
} from '../src/index.ts';

function fakeContext() {
  const calls: string[] = [];
  const context = {
    font: '',
    fillStyle: '',
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    shadowOffsetY: 0,
    letterSpacing: '0px',
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
    rotate: (a: number) => calls.push(`rotate ${a.toFixed(3)}`),
    fillText: (text: string, x: number, y: number) => calls.push(`text ${text} ${x} ${y}`),
  };
  return { context: context as unknown as OverlayContext & typeof context, calls };
}

describe('overlays', () => {
  it('centres multi-line text on its anchor', () => {
    const overlay = createOverlay({ text: 'a\nb', size: 0.1, lineHeight: 1 });
    const { px, lines } = layoutOverlay(overlay, 1000);
    expect(px).toBe(100);
    expect(lines).toEqual([
      { text: 'a', y: -50 },
      { text: 'b', y: 50 },
    ]);
  });

  it('draws visible overlays in frame pixels with the resolved font', () => {
    const { context, calls } = fakeContext();
    const overlays = [
      createOverlay({ text: 'Hello', position: [0.5, 0.25], rotation: 90, uppercase: true }),
      createOverlay({ text: 'hidden', visible: false }),
    ];
    drawOverlays(context, overlays, { width: 200, height: 100 }, () => '"Galbe Inter"');
    expect(calls).toContain('translate 100 25');
    expect(calls).toContain('rotate 1.571');
    expect(calls.some((c) => c.startsWith('text HELLO'))).toBe(true);
    expect(calls.some((c) => c.includes('hidden'))).toBe(false);
    expect(context.font).toContain('"Galbe Inter"');
  });
});

/** A fake canvas whose content is the last frame index drawn. */
function fakeCanvas(width: number, height: number) {
  const state = { frame: -1 };
  const canvas = {
    width,
    height,
    getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }),
  } as unknown as ComposeCanvas;
  return { canvas, state };
}

describe('video', () => {
  it('rounds sizes to even pixels and picks a bitrate', () => {
    expect(evenSize(1081, 1919)).toEqual({ width: 1082, height: 1920 });
    expect(defaultBitrate(1920, 1080, 30)).toBeGreaterThan(4e6);
  });

  it('writes a PNG sequence with one stepped frame per file', async () => {
    const { canvas, state } = fakeCanvas(4, 4);
    const times: number[] = [];
    const result = await renderVideo({
      width: 4,
      height: 4,
      fps: 10,
      frames: 3,
      format: 'png',
      canvas,
      drawFrame: async (index, time) => {
        state.frame = index;
        times.push(time);
      },
      encodePng: async () => new Blob([new Uint8Array([state.frame])]),
    });
    expect(times).toEqual([0, 0.1, 0.2]);
    const files = unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
    expect(Object.keys(files).sort()).toEqual([
      'frame_0000.png',
      'frame_0001.png',
      'frame_0002.png',
    ]);
    expect([...files['frame_0002.png']!]).toEqual([2]);
  });

  it('reports a missing encoder instead of failing silently', async () => {
    const { canvas } = fakeCanvas(4, 4);
    await expect(
      renderVideo({
        width: 4,
        height: 4,
        fps: 10,
        frames: 1,
        format: 'mp4',
        canvas,
        drawFrame: async () => {},
      }),
    ).rejects.toThrow(/cannot encode video/);
  });

  it('composes into a reusable canvas and draws overlays last', async () => {
    const order: string[] = [];
    const { canvas } = fakeCanvas(8, 8);
    await composeImage({
      width: 8,
      height: 8,
      fill: null,
      maxTileSize: 8,
      padding: 0,
      canvas,
      renderTile: (_tile, _full, draw) => {
        order.push('tile');
        draw({} as CanvasImageSource);
      },
      afterCompose: () => {
        order.push('overlays');
      },
    });
    expect(order).toEqual(['tile', 'overlays']);
  });
});
