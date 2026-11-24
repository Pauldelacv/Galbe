import { z } from 'zod';
import { ASSET_URI_PATTERN } from './schema/common.ts';

/*
 * Post-processing effects. The document stores an ordered list of `EffectSpec` with
 * loosely-typed params; the definitions below describe every built-in effect's params
 * (type, range, default, label) once, and drive validation, defaults and the inspector UI.
 * Engines register an implementation per `type` (see @galbe/engine `effects/`).
 *
 * Length params marked `unit: 'px'` are pixels at the document's base frame size
 * (`frame.height`): they scale with export resolution, so previews match exports.
 */

export type EffectStage = 'hdr' | 'display';

interface ParamBase {
  label: string;
  hint?: string;
}
export interface NumberParam extends ParamBase {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  softMin?: number;
  softMax?: number;
  step?: number;
  precision?: number;
  unit?: string;
  integer?: boolean;
}
export interface BooleanParam extends ParamBase {
  kind: 'boolean';
  default: boolean;
}
export interface ColorParam extends ParamBase {
  kind: 'color';
  default: string;
}
export interface SelectParam extends ParamBase {
  kind: 'select';
  default: string;
  options: readonly { value: string; label: string }[];
}
export interface AssetParam extends ParamBase {
  kind: 'asset';
  /** Builtin choices offered next to "Import…". */
  builtins: readonly { value: string; label: string }[];
  default: string;
  accept: string;
}
export type EffectParam = NumberParam | BooleanParam | ColorParam | SelectParam | AssetParam;
export type EffectParamValue = number | boolean | string;

export interface EffectDefinition {
  type: string;
  label: string;
  description: string;
  /** `hdr` effects run on linear light before tone mapping; `display` effects after. */
  stage: EffectStage;
  params: Readonly<Record<string, EffectParam>>;
  /** Params shown only when another param has a given value. */
  showIf?: Readonly<Record<string, (params: Record<string, EffectParamValue>) => boolean>>;
}

const num = (
  label: string,
  value: number,
  min: number,
  max: number,
  extra: Partial<NumberParam> = {},
): NumberParam => ({ kind: 'number', label, default: value, min, max, ...extra });
const bool = (label: string, value: boolean, hint?: string): BooleanParam => ({
  kind: 'boolean',
  label,
  default: value,
  ...(hint ? { hint } : {}),
});
const color = (label: string, value: string): ColorParam => ({
  kind: 'color',
  label,
  default: value,
});
const select = (
  label: string,
  value: string,
  options: [string, string][],
  hint?: string,
): SelectParam => ({
  kind: 'select',
  label,
  default: value,
  options: options.map(([v, l]) => ({ value: v, label: l })),
  ...(hint ? { hint } : {}),
});
const px = (label: string, value: number, min: number, max: number, softMax?: number) =>
  num(label, value, min, max, {
    unit: ' px',
    step: 0.5,
    precision: 1,
    ...(softMax !== undefined ? { softMax } : {}),
  });

/** Procedural LUTs computed by the engine (no file). */
export const BUILTIN_LUTS = [
  { value: 'builtin:luts/teal-orange', label: 'Teal & orange' },
  { value: 'builtin:luts/warm', label: 'Warm' },
  { value: 'builtin:luts/cool', label: 'Cool' },
  { value: 'builtin:luts/bleach', label: 'Bleach bypass' },
  { value: 'builtin:luts/cross', label: 'Cross process' },
  { value: 'builtin:luts/noir', label: 'Noir' },
] as const;

export const EFFECT_DEFINITIONS: readonly EffectDefinition[] = [
  {
    type: 'bloom',
    label: 'Bloom',
    description: 'Glow around bright areas (emissive materials, highlights).',
    stage: 'hdr',
    params: {
      intensity: num('Intensity', 1.2, 0, 10, { softMax: 4 }),
      threshold: num('Threshold', 0.85, 0, 4, {
        softMax: 2,
        hint: 'Brightness that starts to glow',
      }),
      smoothing: num('Smoothing', 0.3, 0, 1),
      radius: num('Radius', 0.65, 0, 1),
    },
  },
  {
    type: 'dof',
    label: 'Depth of field',
    description: 'Camera focus: blurs what is in front of or behind the focus distance.',
    stage: 'hdr',
    params: {
      autoFocus: bool('Auto focus', true, 'Focus on the camera target'),
      focusDistance: num('Focus', 7, 0.05, 200, { softMax: 30, unit: ' u' }),
      focusRange: num('Range', 1.5, 0.01, 50, { softMax: 10, unit: ' u' }),
      bokeh: px('Blur', 6, 0, 40, 20),
    },
    showIf: { focusDistance: (p) => !p.autoFocus },
  },
  {
    type: 'adjust',
    label: 'Colour adjust',
    description: 'Brightness, contrast, saturation and hue.',
    stage: 'display',
    params: {
      brightness: num('Brightness', 0, -1, 1),
      contrast: num('Contrast', 0, -1, 1),
      saturation: num('Saturation', 0, -1, 1),
      hue: num('Hue', 0, -180, 180, { unit: '°', step: 1, precision: 0 }),
    },
  },
  {
    type: 'lut',
    label: 'LUT',
    description: 'Colour grade from a 3D lookup table (.cube) or a built-in look.',
    stage: 'display',
    params: {
      lut: {
        kind: 'asset',
        label: 'Look',
        builtins: BUILTIN_LUTS,
        default: 'builtin:luts/teal-orange',
        accept: '.cube',
      },
      intensity: num('Mix', 1, 0, 1),
    },
  },
  {
    type: 'chromaticAberration',
    label: 'Chromatic aberration',
    description: 'Colour fringes towards the edges, like a cheap lens.',
    stage: 'display',
    params: {
      amount: px('Amount', 4, 0, 60, 20),
      radial: bool('Radial', true, 'Stronger towards the edges'),
    },
  },
  {
    type: 'vignette',
    label: 'Vignette',
    description: 'Darkens (or tints) the corners.',
    stage: 'display',
    params: {
      darkness: num('Darkness', 0.55, 0, 1),
      offset: num('Size', 0.45, 0, 1),
      softness: num('Softness', 0.5, 0.01, 1),
      color: color('Colour', '#000000'),
    },
  },
  {
    type: 'grain',
    label: 'Film grain',
    description: 'Deterministic film grain (identical in every export).',
    stage: 'display',
    params: {
      amount: num('Amount', 0.08, 0, 1, { softMax: 0.4 }),
      size: px('Size', 1.5, 0.5, 10),
      monochrome: bool('Monochrome', true),
      seed: num('Seed', 1, 0, 9999, { integer: true, step: 1, precision: 0 }),
    },
  },
  {
    type: 'halftone',
    label: 'Halftone',
    description: 'Print-style dot screen.',
    stage: 'display',
    params: {
      mode: select('Mode', 'mono', [
        ['mono', 'Mono'],
        ['cmyk', 'CMYK'],
        ['color', 'Colour dots'],
      ]),
      shape: select('Shape', 'dot', [
        ['dot', 'Dots'],
        ['line', 'Lines'],
        ['square', 'Squares'],
      ]),
      size: px('Cell', 10, 2, 120, 40),
      angle: num('Angle', 45, -90, 90, { unit: '°', step: 1, precision: 0 }),
      ink: color('Ink', '#111111'),
      paper: color('Paper', '#f4f1ea'),
      mix: num('Mix', 1, 0, 1),
    },
    showIf: { ink: (p) => p.mode === 'mono', paper: (p) => p.mode !== 'color' },
  },
  {
    type: 'dither',
    label: 'Dithering',
    description: 'Ordered (Bayer) dithering with a reduced palette.',
    stage: 'display',
    params: {
      pattern: select('Pattern', 'bayer4', [
        ['bayer2', 'Bayer 2×2'],
        ['bayer4', 'Bayer 4×4'],
        ['bayer8', 'Bayer 8×8'],
      ]),
      palette: select('Palette', 'duotone', [
        ['color', 'Colour levels'],
        ['mono', 'Greyscale'],
        ['duotone', 'Two colours'],
      ]),
      levels: num('Levels', 2, 2, 16, { integer: true, step: 1, precision: 0 }),
      pixelSize: px('Pixel', 2, 1, 32),
      dark: color('Dark', '#14121f'),
      light: color('Light', '#f2efe6'),
    },
    showIf: { dark: (p) => p.palette === 'duotone', light: (p) => p.palette === 'duotone' },
  },
  {
    type: 'pixel',
    label: 'Pixelate',
    description: 'Big square pixels.',
    stage: 'display',
    params: { size: px('Pixel', 8, 1, 200, 64) },
  },
  {
    type: 'ascii',
    label: 'ASCII',
    description: 'Renders the image with text characters.',
    stage: 'display',
    params: {
      cell: px('Cell', 12, 4, 80, 40),
      colorMode: select('Colour', 'original', [
        ['original', 'Image colours'],
        ['mono', 'Ink on background'],
      ]),
      ink: color('Ink', '#e8ffe8'),
      background: color('Background', '#050805'),
      invert: bool('Invert', false),
    },
    showIf: { ink: (p) => p.colorMode === 'mono', background: (p) => p.colorMode === 'mono' },
  },
  {
    type: 'glitch',
    label: 'Glitch',
    description: 'Digital block displacement and RGB split (deterministic).',
    stage: 'display',
    params: {
      amount: num('Amount', 0.5, 0, 1),
      block: px('Block', 40, 4, 400, 160),
      split: px('RGB split', 6, 0, 80, 30),
      seed: num('Seed', 7, 0, 9999, { integer: true, step: 1, precision: 0 }),
    },
  },
];

const BY_TYPE = new Map(EFFECT_DEFINITIONS.map((definition) => [definition.type, definition]));

export function getEffectDefinition(type: string): EffectDefinition | undefined {
  return BY_TYPE.get(type);
}

export const EffectSpecSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  enabled: z.boolean().default(true),
  params: z.record(z.string(), z.union([z.number(), z.boolean(), z.string()])).default({}),
});
export type EffectSpec = z.infer<typeof EffectSpecSchema>;

const HEX = /^#[0-9a-f]{6}$/i;

/** One param value coerced into its definition (clamped, defaulted). */
export function coerceParam(param: EffectParam, value: unknown): EffectParamValue {
  switch (param.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return param.default;
      const clamped = Math.min(param.max, Math.max(param.min, value));
      return param.integer ? Math.round(clamped) : clamped;
    }
    case 'boolean':
      return typeof value === 'boolean' ? value : param.default;
    case 'color':
      return typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : param.default;
    case 'select':
      return typeof value === 'string' && param.options.some((o) => o.value === value)
        ? value
        : param.default;
    case 'asset':
      return typeof value === 'string' && ASSET_URI_PATTERN.test(value) ? value : param.default;
  }
}

/**
 * Full, valid params for an effect: unknown keys dropped, missing ones defaulted. Unknown
 * effect types (from a newer Galbe or a plugin) keep their params untouched.
 */
export function resolveEffectParams(
  spec: Pick<EffectSpec, 'type' | 'params'>,
): Record<string, EffectParamValue> {
  const definition = getEffectDefinition(spec.type);
  if (!definition) return { ...spec.params };
  const out: Record<string, EffectParamValue> = {};
  for (const [key, param] of Object.entries(definition.params))
    out[key] = coerceParam(param, spec.params[key]);
  return out;
}

export function defaultEffectParams(type: string): Record<string, EffectParamValue> {
  return resolveEffectParams({ type, params: {} });
}
