import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { unzipSync } from 'fflate';

const IGNORED = /GPU stall|THREE\.Clock|Download the React DevTools|GL Driver Message/;
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !IGNORED.test(message.text())) errors.push(message.text());
  });
  return errors;
}

async function sceneReady(page: Page) {
  await expect(page.locator('[data-testid=viewport][data-ready]')).toBeVisible({ timeout: 30_000 });
}

// biome-ignore lint/suspicious/noExplicitAny: the debug handle is untyped on purpose
type Galbe = any;

/** Runs code against the studio's debug handles (stores and engine). */
function studio<T>(page: Page, fn: (galbe: Galbe) => T | Promise<T>): Promise<T> {
  return page.evaluate(`(${fn.toString()})(globalThis.__galbe)`) as Promise<T>;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('galbe');
      request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
  });
  await page.reload();
  await sceneReady(page);
});

test('motion presets animate on the timeline, deterministically', async ({ page }) => {
  const errors = collectErrors(page);
  await page.getByTestId('layers').locator('li').first().click();
  await page.getByTestId('add-motion').selectOption('spin');
  await expect(page.getByTestId('motion-spin')).toBeVisible();
  await expect(page.getByTestId('timeline')).toBeVisible();

  const rotationAt = (time: number) =>
    page.evaluate((t) => {
      const g = (globalThis as unknown as { __galbe: Galbe }).__galbe;
      g.playbackStore.getState().seek(t);
      const id = g.documentStore.getState().doc.nodes[0].id;
      return g.controller.objectOf(id).rotation.y as number;
    }, time);
  expect(await rotationAt(0)).toBeCloseTo(0);
  expect(await rotationAt(1)).toBeCloseTo(Math.PI / 2, 3);
  expect(await rotationAt(1)).toBeCloseTo(Math.PI / 2, 3);
  await expect(page.getByTestId('timecode')).toContainText('00:01.00');

  // Space plays, Space pauses (snapped to a frame).
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  await page.keyboard.press('Space');
  const played = await studio(page, (g) => g.playbackStore.getState().time as number);
  expect(played).toBeGreaterThan(1);
  expect(Math.abs(played * 30 - Math.round(played * 30))).toBeLessThan(1e-6);
  expect(errors).toEqual([]);
});

test('auto-key turns edits into keyframes', async ({ page }) => {
  const errors = collectErrors(page);
  await page.keyboard.press('l');
  await page.getByTestId('autokey').click();
  await studio(page, (g) => g.playbackStore.getState().seek(2));
  await page.getByTestId('layers').locator('li').first().click();
  // Type a value in Position X.
  const x = page.getByRole('slider', { name: 'X' }).first();
  await x.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1.5');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('keyframe')).toHaveCount(2);
  const at = (t: number) =>
    page.evaluate((time) => {
      const g = (globalThis as unknown as { __galbe: Galbe }).__galbe;
      g.playbackStore.getState().seek(time);
      const id = g.documentStore.getState().doc.nodes[0].id;
      return g.controller.objectOf(id).position.x as number;
    }, t);
  expect(await at(0)).toBeCloseTo(0);
  expect(await at(2)).toBeCloseTo(1.5);
  expect(await at(1)).toBeGreaterThan(0.1);
  // Deleting the selected keyframe.
  await page.getByTestId('keyframe').last().click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('keyframe')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('cover: gradient background, overlay text and guides', async ({ page }) => {
  const errors = collectErrors(page);
  await page.getByTestId('tool-cover').click();
  await page.getByTestId('gradient-ember').click();
  expect(await studio(page, (g) => g.controller.background.active as boolean)).toBe(true);
  // The gradient shows with and without the effect stack (composited after tone mapping).
  const topPixel = () =>
    page.evaluate(() => {
      const { viewport } = (globalThis as unknown as { __galbe: Galbe }).__galbe;
      const gl = viewport.gl.getContext() as WebGL2RenderingContext;
      if (viewport.post?.active) viewport.post.render(viewport.scene, viewport.camera);
      else viewport.gl.render(viewport.scene, viewport.camera);
      const out = new Uint8Array(4);
      gl.readPixels(
        gl.drawingBufferWidth / 2,
        gl.drawingBufferHeight - 4,
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        out,
      );
      return [...out];
    });
  const [r1, g1] = await topPixel();
  expect(r1).toBeGreaterThan(150);
  expect(r1).toBeGreaterThan(g1! + 30);
  await studio(page, (g) =>
    g.documentStore.getState().update(
      (draft: Galbe) => {
        draft.effects.push({
          id: 'vignette1',
          type: 'vignette',
          enabled: true,
          params: { darkness: 0 },
        });
      },
      { animate: false },
    ),
  );
  const [r2, g2] = await topPixel();
  expect(Math.abs(r2! - r1!)).toBeLessThan(25);
  expect(Math.abs(g2! - g1!)).toBeLessThan(25);
  await page.getByTestId('add-overlay').click();
  await page.getByTestId('overlay-text').fill('HELLO');
  await expect(page.getByTestId('overlay-handle')).toHaveCount(1);
  // The overlay canvas has drawn something.
  const inked = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid=overlay-canvas]')!;
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count++;
      return count;
    });
  await expect.poll(inked).toBeGreaterThan(100);
  // Drag the overlay down.
  const handle = page.getByTestId('overlay-handle');
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 120, { steps: 5 });
  await page.mouse.up();
  const y = await studio(
    page,
    (g) => g.documentStore.getState().doc.overlays[0].position[1] as number,
  );
  expect(y).toBeGreaterThan(0.2);
  await page.getByText('Safe zones').click();
  await expect(page.getByTestId('guides')).toBeVisible();
  expect(errors).toEqual([]);
});

test('video background from a dropped clip', async ({ page }) => {
  const errors = collectErrors(page);
  await page.getByTestId('tool-cover').click();
  await page.getByTestId('background-type').selectOption('video');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Choose…' }).click(),
  ]);
  await chooser.setFiles(path.join(fixtures, 'clip.webm'));
  await expect
    .poll(() => studio(page, (g) => g.controller.background.uniforms.uBgHasMap.value as boolean))
    .toBe(true);
  await studio(page, (g) => g.playbackStore.getState().seek(0.5));
  await sceneReady(page);
  expect(errors).toEqual([]);
});

test('exports the timeline as a PNG sequence and a WebM', async ({ page }) => {
  const errors = collectErrors(page);
  await studio(page, (g) =>
    g.documentStore.getState().update((draft: Galbe) => {
      draft.animation.duration = 0.5;
      draft.animation.fps = 10;
    }),
  );
  await page.getByTestId('layers').locator('li').first().click();
  await page.getByTestId('add-motion').selectOption('swing');

  await page.getByTestId('export-button').click();
  await page.getByRole('radio', { name: 'PNG seq.' }).click();
  await page.getByRole('radio', { name: '0.5×' }).click();
  await expect(page.getByTestId('export-size')).toContainText('540 × 540');
  await expect(page.getByTestId('export-size')).toContainText('5 frames');
  const [zip] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-confirm').click(),
  ]);
  expect(zip.suggestedFilename()).toMatch(/540x540-10fps\.zip$/);
  const files = unzipSync(new Uint8Array(readFileSync((await zip.path())!)));
  expect(Object.keys(files)).toHaveLength(5);
  const first = files['frame_0000.png']!;
  expect(String.fromCharCode(...first.subarray(1, 4))).toBe('PNG');

  await page.getByTestId('export-button').click();
  await page.getByRole('radio', { name: 'WebM' }).click();
  await page.getByRole('radio', { name: '0.5×' }).click();
  const [webm] = await Promise.all([
    page.waitForEvent('download', { timeout: 120_000 }),
    page.getByTestId('export-confirm').click(),
  ]);
  const bytes = readFileSync((await webm.path())!);
  // EBML header.
  expect([...bytes.subarray(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
  expect(bytes.length).toBeGreaterThan(2000);
  expect(errors).toEqual([]);
});
