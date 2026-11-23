/// <reference path="../types/opentype.d.ts" />
import type { AssetUri, FontRef } from '@galbe/core';
import { type Font, parse } from 'opentype.js';
import type { AssetSource } from '../assets/AssetSource.ts';
import { createGposKerner, type Kerner } from './gposKerning.ts';

const kerners = new WeakMap<Font, Kerner>();

/** GPOS kerning resolved from the raw font file (see gposKerning.ts), when available. */
export const kernerFor = (font: Font): Kerner | undefined => kerners.get(font);

/** A loaded face: one parsed font per file, in fallback order. */
export interface LoadedFace {
  key: string;
  fonts: Font[];
}

export const fontRefKey = (ref: FontRef): string => ref.files.join('|');

/** Parses font bytes (TTF, OTF, WOFF). WOFF2 is not supported by opentype.js. */
export function parseFont(bytes: ArrayBuffer): Font {
  const view = new Uint8Array(bytes, 0, 4);
  const signature = String.fromCharCode(...view);
  if (signature === 'wOF2')
    throw new Error('WOFF2 fonts are not supported yet; use TTF, OTF or WOFF.');
  const font = parse(bytes);
  const kerner = createGposKerner(bytes);
  if (kerner) kerners.set(font, kerner);
  return font;
}

/**
 * Loads and caches fonts by asset URI. A face resolves when every file has loaded or
 * failed; failed files are skipped (a face needs at least one).
 */
export class FontLibrary {
  private readonly files = new Map<AssetUri, Promise<Font | null>>();
  private readonly parsed = new Map<AssetUri, Font | null>();
  private readonly faces = new Map<string, Promise<LoadedFace>>();

  constructor(private readonly source: AssetSource) {}

  /** Synchronous lookup; undefined until every file of the face has settled. */
  get(ref: FontRef): LoadedFace | undefined {
    if (!ref.files.every((uri) => this.parsed.has(uri))) return undefined;
    const fonts = ref.files
      .map((uri) => this.parsed.get(uri))
      .filter((font): font is Font => !!font);
    return fonts.length ? { key: fontRefKey(ref), fonts } : undefined;
  }

  /** Whether a face finished loading but none of its files could be parsed. */
  failed(ref: FontRef): boolean {
    return ref.files.every((uri) => this.parsed.has(uri) && this.parsed.get(uri) === null);
  }

  load(ref: FontRef): Promise<LoadedFace> {
    const key = fontRefKey(ref);
    let face = this.faces.get(key);
    if (!face) {
      face = Promise.all(ref.files.map((uri) => this.loadFile(uri))).then((fonts) => {
        const ok = fonts.filter((font): font is Font => !!font);
        if (!ok.length) {
          this.faces.delete(key);
          throw new Error(`Could not load font "${ref.family}".`);
        }
        return { key, fonts: ok };
      });
      this.faces.set(key, face);
    }
    return face;
  }

  /** Registers already-parsed bytes (e.g. right after an import) to skip a fetch. */
  register(uri: AssetUri, bytes: ArrayBuffer): Font {
    const font = parseFont(bytes);
    this.parsed.set(uri, font);
    this.files.set(uri, Promise.resolve(font));
    return font;
  }

  private loadFile(uri: AssetUri): Promise<Font | null> {
    let file = this.files.get(uri);
    if (!file) {
      file = this.source
        .fetchBytes(uri)
        .then(parseFont)
        .catch((error: unknown) => {
          console.warn(`[galbe] font ${uri} failed to load`, error);
          return null;
        })
        .then((font) => {
          this.parsed.set(uri, font);
          return font;
        });
      this.files.set(uri, file);
    }
    return file;
  }
}
