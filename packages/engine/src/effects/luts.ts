import { Data3DTexture, DataUtils, HalfFloatType, LinearFilter, RGBAFormat } from 'three';

/** A 3D colour lookup table in display (sRGB) space, RGB triples, red fastest. */
export interface LutData {
  size: number;
  data: Float32Array;
  title?: string;
}

/** Parses an Adobe/Resolve `.cube` 3D LUT. Domains other than 0…1 are remapped. */
export function parseCubeLut(text: string): LutData {
  let size = 0;
  let title: string | undefined;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const values: number[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const [keyword, ...rest] = line.split(/\s+/);
    switch (keyword!.toUpperCase()) {
      case 'TITLE':
        title = rest.join(' ').replace(/^"|"$/g, '');
        break;
      case 'LUT_3D_SIZE':
        size = Number(rest[0]);
        break;
      case 'LUT_1D_SIZE':
        throw new Error('1D LUTs are not supported; use a 3D .cube file.');
      case 'DOMAIN_MIN':
        min = rest.map(Number);
        break;
      case 'DOMAIN_MAX':
        max = rest.map(Number);
        break;
      default: {
        const triple = line.split(/\s+/).map(Number);
        if (triple.length === 3 && triple.every(Number.isFinite)) values.push(...triple);
      }
    }
  }
  if (!Number.isInteger(size) || size < 2 || size > 128)
    throw new Error('Invalid .cube file: missing or unsupported LUT_3D_SIZE.');
  if (values.length !== size ** 3 * 3)
    throw new Error(
      `Invalid .cube file: expected ${size ** 3} entries, found ${values.length / 3}.`,
    );
  const data = new Float32Array(values);
  for (let i = 0; i < data.length; i++) {
    const c = i % 3;
    const range = max[c]! - min[c]!;
    if (range !== 1 || min[c] !== 0) data[i] = (data[i]! - min[c]!) / (range || 1);
  }
  return { size, data, ...(title ? { title } : {}) };
}

type Look = (r: number, g: number, b: number) => [number, number, number];

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const smooth = (x: number) => x * x * (3 - 2 * x);
const contrast = (x: number, amount: number) => clamp((x - 0.5) * amount + 0.5);

/** Galbe's built-in looks, computed procedurally (no files, no licences involved). */
const LOOKS: Record<string, Look> = {
  'teal-orange': (r, g, b) => {
    const y = luma(r, g, b);
    // Shadows towards teal, highlights towards orange, skin-ish midtones kept.
    const t = smooth(y);
    return [
      clamp(contrast(r, 1.06) + 0.07 * t - 0.03 * (1 - t) * y * 4),
      clamp(contrast(g, 1.04) + 0.02 * t + 0.015 * (1 - t) * y * 4),
      clamp(contrast(b, 1.06) - 0.08 * t + 0.04 * (1 - t) * y * 4),
    ];
  },
  warm: (r, g, b) => [clamp(r * 1.06 + 0.02), clamp(g * 1.01 + 0.01), clamp(b * 0.9)],
  cool: (r, g, b) => [clamp(r * 0.92), clamp(g * 1.0 + 0.01), clamp(b * 1.08 + 0.03)],
  bleach: (r, g, b) => {
    const y = luma(r, g, b);
    const mix = (c: number) => clamp(contrast(c * 0.55 + y * 0.45, 1.25));
    return [mix(r), mix(g), mix(b)];
  },
  cross: (r, g, b) => [
    clamp(smooth(r) * 1.05),
    clamp(contrast(g, 1.15) + 0.03),
    clamp(b * 0.75 + 0.12),
  ],
  noir: (r, g, b) => {
    const y = contrast(luma(r, g, b), 1.35);
    return [y, y, clamp(y * 1.02)];
  },
};

export const BUILTIN_LUT_IDS = Object.keys(LOOKS);

export function builtinLut(id: string, size = 33): LutData | null {
  const look = LOOKS[id];
  if (!look) return null;
  const data = new Float32Array(size ** 3 * 3);
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        const out = look(r / (size - 1), g / (size - 1), b / (size - 1));
        data[i++] = out[0];
        data[i++] = out[1];
        data[i++] = out[2];
      }
  return { size, data };
}

export function lutToTexture(lut: LutData): Data3DTexture {
  // Half floats filter linearly everywhere (float textures need an extension).
  const rgba = new Uint16Array(lut.size ** 3 * 4);
  const one = DataUtils.toHalfFloat(1);
  for (let i = 0, j = 0; i < lut.data.length; i += 3, j += 4) {
    rgba[j] = DataUtils.toHalfFloat(lut.data[i]!);
    rgba[j + 1] = DataUtils.toHalfFloat(lut.data[i + 1]!);
    rgba[j + 2] = DataUtils.toHalfFloat(lut.data[i + 2]!);
    rgba[j + 3] = one;
  }
  const texture = new Data3DTexture(rgba, lut.size, lut.size, lut.size);
  texture.format = RGBAFormat;
  texture.type = HalfFloatType;
  texture.minFilter = texture.magFilter = LinearFilter;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/** Loads LUT textures from `builtin:luts/<id>` (procedural) or `.cube` project assets. */
export class LutLibrary {
  private readonly cache = new Map<string, Promise<Data3DTexture | null>>();
  private readonly ready = new Map<string, Data3DTexture | null>();

  constructor(
    private readonly source: { fetchBytes(uri: string): Promise<ArrayBuffer> },
    private readonly onChange: () => void,
  ) {}

  get pending(): number {
    return this.cache.size - this.ready.size;
  }

  get(uri: string): Data3DTexture | null {
    if (this.ready.has(uri)) return this.ready.get(uri) ?? null;
    if (uri.startsWith('builtin:luts/')) {
      const lut = builtinLut(uri.slice('builtin:luts/'.length));
      const texture = lut ? lutToTexture(lut) : null;
      this.ready.set(uri, texture);
      this.cache.set(uri, Promise.resolve(texture));
      return texture;
    }
    if (!this.cache.has(uri)) {
      const promise = this.source
        .fetchBytes(uri)
        .then((bytes) => lutToTexture(parseCubeLut(new TextDecoder().decode(bytes))))
        .catch((error: unknown) => {
          console.warn(`[galbe] LUT ${uri} failed to load`, error);
          return null;
        })
        .then((texture) => {
          this.ready.set(uri, texture);
          this.onChange();
          return texture;
        });
      this.cache.set(uri, promise);
    }
    return null;
  }

  async whenReady(): Promise<void> {
    while (this.pending > 0) await Promise.allSettled([...this.cache.values()]);
  }

  dispose(): void {
    for (const texture of this.ready.values()) texture?.dispose();
    this.ready.clear();
    this.cache.clear();
  }
}
