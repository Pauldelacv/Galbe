import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

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

/** Reads one pixel of the viewport after rendering a frame (through the effect stack). */
function viewportPixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ([px, py]) => {
      interface Handle {
        gl: { getContext(): WebGL2RenderingContext; render(s: unknown, c: unknown): void };
        scene: unknown;
        camera: unknown;
        post: { active: boolean; render(s: unknown, c: unknown): void } | null;
      }
      const { viewport } = (globalThis as unknown as { __galbe: { viewport: Handle } }).__galbe;
      const gl = viewport.gl.getContext();
      if (viewport.post?.active) viewport.post.render(viewport.scene, viewport.camera);
      else viewport.gl.render(viewport.scene, viewport.camera);
      const out = new Uint8Array(4);
      gl.readPixels(px!, py!, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return [...out];
    },
    [x, y],
  );
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

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="45" fill="#ff4d2e"/>
  <path d="M30 30h40v40H30z M40 40v20h20V40z" fill="#ffffff" fill-rule="evenodd"/>
</svg>`;

test('pasting an SVG makes an extruded shape with one material per colour', async ({ page }) => {
  const errors = collectErrors(page);
  await page.evaluate((svg) => {
    const data = new DataTransfer();
    data.setData('text/plain', svg);
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
  }, LOGO);
  await expect(page.getByTestId('layers').getByText('Pasted shape')).toBeVisible();
  const paths = page.getByTestId('shape-paths').locator('li');
  await expect(paths).toHaveCount(2);
  // Pick one path and restyle only it.
  await paths.first().click();
  await page.getByTestId('material-gold').click();
  await expect(page.getByTestId('material-gold')).toHaveAttribute('data-active', 'true');
  await paths.nth(1).click();
  await expect(page.getByTestId('material-gold')).not.toHaveAttribute('data-active', 'true');
  expect(errors).toEqual([]);
});

test('primitives, a GLB model, grouping and history', async ({ page }) => {
  const errors = collectErrors(page);
  await page.getByTestId('tool-primitive').click();
  await page.getByTestId('primitive-torus').click();
  await expect(page.getByTestId('layers').getByText('Torus')).toBeVisible();

  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByTestId('tool-object').click(),
  ]);
  await chooser.setFiles(path.join(fixtures, 'gem.glb'));
  await expect(page.getByTestId('layers').getByText('gem')).toBeVisible();
  await sceneReady(page);

  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+g');
  await expect(page.getByTestId('layers').getByText('Group')).toBeVisible();
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(4);

  await page.getByRole('radio', { name: 'History' }).click();
  const history = page.getByTestId('history');
  await expect(history.getByText('Group')).toBeVisible();
  await history.getByText('Add torus').click();
  await page.getByRole('radio', { name: 'Layers' }).click();
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(2);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('effects render in the viewport and in exports', async ({ page }) => {
  const errors = collectErrors(page);
  const before = await viewportPixel(page, 4, 4);
  await page.getByRole('radio', { name: /^Effects/ }).click();
  await page.getByTestId('add-effect').selectOption('vignette');
  await page.getByTestId('add-effect').selectOption('bloom');
  await expect(page.getByTestId('effect-vignette')).toBeVisible();
  // Vignette darkens the corner; the flat background stays opaque.
  const after = await viewportPixel(page, 4, 4);
  expect(after[3]).toBe(255);
  expect(after[0]!).toBeLessThan(before[0]!);

  // Removing DOF used to break the stack: add and remove it, effects keep working.
  await page.getByTestId('add-effect').selectOption('dof');
  await page.getByTestId('effect-dof').getByRole('button', { name: 'Remove' }).click();
  expect((await viewportPixel(page, 4, 4))[3]).toBe(255);

  await page.getByTestId('export-button').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-confirm').click(),
  ]);
  const bytes = readFileSync((await download.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(errors).toEqual([]);
});
