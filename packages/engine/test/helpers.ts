import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { builtinFilePath } from '@galbe/assets';
import { type AssetUri, type FontRef, parseAssetUri } from '@galbe/core';
import type { AssetSource } from '../src/assets/AssetSource.ts';
import { FontLibrary } from '../src/fonts/FontLibrary.ts';

const filesDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../assets/files');

export const diskAssetSource: AssetSource = {
  async resolveUrl(uri: AssetUri) {
    return `file://${resolvePath(uri)}`;
  },
  async fetchBytes(uri: AssetUri) {
    const buffer = fs.readFileSync(resolvePath(uri));
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
  },
};

function resolvePath(uri: AssetUri): string {
  const parsed = parseAssetUri(uri);
  const file = parsed?.scheme === 'builtin' ? builtinFilePath(parsed.id) : undefined;
  if (!file) throw new Error(`not on disk: ${uri}`);
  return path.join(filesDir, file);
}

export const fontRef = (
  family: string,
  weight: number,
  style: 'normal' | 'italic' = 'normal',
): FontRef => ({
  family,
  weight,
  style,
  files: ['latin', 'latin-ext'].map(
    (subset) => `builtin:fonts/${family}/${subset}-${weight}-${style}`,
  ),
});

export async function loadFace(
  family = 'inter',
  weight = 900,
  style: 'normal' | 'italic' = 'normal',
) {
  return new FontLibrary(diskAssetSource).load(fontRef(family, weight, style));
}
