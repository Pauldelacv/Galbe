import type { FontRef } from '@galbe/core';
import { create } from 'zustand';
import { assetSource } from '../../engine/studioEngine.ts';

/** Bumped whenever an overlay font finishes loading (overlays redraw). */
export const useOverlayFonts = create<{ version: number }>()(() => ({ version: 0 }));

const families = new Map<string, Promise<string | null>>();
const ready = new Map<string, string | null>();

const keyOf = (font: FontRef) =>
  `${font.family}|${font.weight}|${font.style}|${font.files.join(',')}`;

let counter = 0;

/**
 * Registers the files of a font reference as CSS font faces. Each file (subset) gets its
 * own family name and they are listed in order, so characters fall back file by file like
 * they do for 3D text.
 */
function load(font: FontRef): Promise<string | null> {
  const key = keyOf(font);
  let promise = families.get(key);
  if (!promise) {
    promise = Promise.all(
      font.files.map(async (uri) => {
        const name = `galbe-overlay-${++counter}`;
        const face = new FontFace(name, await assetSource.fetchBytes(uri), {
          weight: String(font.weight),
          style: font.style,
        });
        await face.load();
        document.fonts.add(face);
        return `"${name}"`;
      }),
    )
      .then((names) => names.join(', '))
      .catch((error: unknown) => {
        console.warn('[galbe] overlay font failed to load', error);
        return null;
      })
      .then((value) => {
        ready.set(key, value);
        useOverlayFonts.setState((state) => ({ version: state.version + 1 }));
        return value;
      });
    families.set(key, promise);
  }
  return promise;
}

/** CSS family list of a loaded font, or null (loading starts on first request). */
export function overlayFontFamily(font: FontRef): string | null {
  const key = keyOf(font);
  if (ready.has(key)) return ready.get(key) ?? null;
  void load(font);
  return null;
}

/** Resolves once every font the overlays use has loaded (before exporting). */
export async function overlayFontsReady(fonts: readonly FontRef[]): Promise<void> {
  await Promise.all(fonts.map(load));
}
