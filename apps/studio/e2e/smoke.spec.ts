import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

/** Errors that are not ours (driver notices from software WebGL, library deprecations). */
const IGNORED = /GPU stall|THREE\.Clock|Download the React DevTools|GL Driver Message/;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !IGNORED.test(message.text())) errors.push(message.text());
  });
  return errors;
}

/** Waits until fonts and environment are loaded and the scene is rendered. */
async function sceneReady(page: Page) {
  await expect(page.locator('[data-testid=viewport][data-ready]')).toBeVisible({ timeout: 30_000 });
}

/** Names of the projects stored in IndexedDB. */
function storedNames(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('galbe');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const request = database.transaction('projects').objectStore('projects').getAll();
          request.onsuccess = () => {
            database.close();
            resolve((request.result as { name: string }[]).map((record) => record.name));
          };
          request.onerror = () => reject(request.error);
        };
      }),
  );
}

async function canvasCenter(page: Page) {
  const box = await page.locator('[data-testid=viewport] canvas').boundingBox();
  if (!box) throw new Error('viewport canvas not found');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
});

test('the studio loads with a starter scene', async ({ page }) => {
  const errors = collectErrors(page);
  await expect(page.locator('[data-testid=viewport] canvas')).toBeVisible();
  await expect(page.getByTestId('layers').getByText('Galbe')).toBeVisible();
  await sceneReady(page);
  await expect(page.getByText('Saved locally')).toBeVisible();
  expect(errors).toEqual([]);
});

test('type, style, undo and export a transparent PNG', async ({ page }) => {
  const errors = collectErrors(page);
  await sceneReady(page);

  // Select the starter text from the viewport and edit it.
  const center = await canvasCenter(page);
  await page.mouse.click(center.x, center.y);
  const text = page.getByTestId('text-content');
  await expect(text).toBeVisible();
  await text.fill('Smoke\ntest');
  await expect(page.getByTestId('layers').getByText('Smoke')).toBeVisible();

  // Apply a material preset, then undo it.
  await page.getByTestId('material-glass').click();
  await expect(page.getByTestId('material-glass')).toHaveAttribute('data-active', 'true');
  await page.getByTestId('material-gold').click();
  await expect(page.getByTestId('material-gold')).toHaveAttribute('data-active', 'true');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.getByTestId('layers').getByText('Smoke').click();
  await expect(page.getByTestId('material-glass')).toHaveAttribute('data-active', 'true');

  // Add a second text layer with the keyboard.
  await page.keyboard.press('Escape');
  await page.keyboard.press('t');
  await expect(page.getByTestId('layers').locator('li')).toHaveCount(2);

  // Transparent background, then export at 2×. (Escape leaves the text field, then deselects.)
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'None' }).click();
  await page.getByTestId('export-button').click();
  await expect(page.getByTestId('export-size')).toContainText('2160 × 2160');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-confirm').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/2160x2160\.png$/);
  const bytes = readFileSync((await download.path())!);
  // PNG signature, 2160×2160, RGBA (colour type 6).
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(2160);
  expect(bytes.readUInt32BE(20)).toBe(2160);
  expect(bytes[25]).toBe(6);
  expect(errors).toEqual([]);
});

test('projects survive a reload and round-trip through .galbe files', async ({ page }) => {
  await expect(page.getByTestId('layers').getByText('Galbe')).toBeVisible();
  const name = page.getByLabel('Project name');
  await name.fill('Round trip');
  await name.press('Enter');
  await expect.poll(() => storedNames(page)).toContain('Round trip');
  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Round trip');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ]);
  expect(download.suggestedFilename()).toBe('round-trip.galbe');
  const file = test.info().outputPath('round-trip.galbe');
  await download.saveAs(file);

  await page.getByTestId('projects-button').click();
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByLabel('Project name')).toHaveValue('Untitled');

  // Import by dropping the file on the studio (same path as the file picker).
  const data = readFileSync(file).toString('base64');
  const transfer = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(new File([bytes], 'round-trip.galbe', { type: 'application/zip' }));
    return dataTransfer;
  }, data);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await expect(page.getByLabel('Project name')).toHaveValue('Round trip (imported)');
  await expect(page.getByTestId('layers').getByText('Galbe')).toBeVisible();
});
