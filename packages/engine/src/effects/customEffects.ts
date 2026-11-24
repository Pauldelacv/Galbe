import { BlendFunction, Effect, EffectAttribute } from 'postprocessing';
import { Color, type Data3DTexture, Uniform, Vector2 } from 'three';
import { BACKGROUND_GLSL } from '../background/BackgroundLayer.ts';

/*
 * Galbe's own screen-space effects. They work in *full-frame pixel* coordinates
 * (`uOffset` + uv × resolution) so tiled exports have no seams, and their sizes are
 * multiplied by `uPxScale` (render pixels per document pixel) so the viewport preview
 * matches exports at any resolution. Colour work happens in sRGB (display) space.
 */

const COMMON = /* glsl */ `
uniform vec2 uFull;
uniform vec2 uOffset;
uniform float uPxScale;

vec2 framePx(const in vec2 uv) { return uOffset + uv * resolution; }
vec2 tileUv(const in vec2 px) { return (px - uOffset) / resolution; }
vec3 toSrgb(const in vec3 c) {
  vec3 x = max(c, vec3(0.0));
  return mix(x * 12.92, 1.055 * pow(x, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, x));
}
vec3 toLinear(const in vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
float luma(const in vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 rotate2(const in vec2 v, const in float a) {
  float c = cos(a); float s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}
`;

export interface FrameInfo {
  /** Full output frame in render pixels. */
  fullWidth: number;
  fullHeight: number;
  /** Tile origin in render pixels, from the top-left (camera.setViewOffset convention). */
  offsetX: number;
  offsetY: number;
  /** Tile size in render pixels. */
  width: number;
  height: number;
  /** Render pixels per document pixel. */
  pxScale: number;
}

type Uniforms = Map<string, Uniform<unknown>>;

/** Base class: owns the frame uniforms and a typed `set` for params. */
export class GalbeEffect extends Effect {
  constructor(name: string, body: string, uniforms: Record<string, unknown>, convolution = false) {
    const map: Uniforms = new Map<string, Uniform<unknown>>([
      ['uFull', new Uniform<unknown>(new Vector2(1, 1))],
      ['uOffset', new Uniform<unknown>(new Vector2())],
      ['uPxScale', new Uniform<unknown>(1)],
    ]);
    for (const [key, value] of Object.entries(uniforms)) map.set(key, new Uniform<unknown>(value));
    super(name, COMMON + body, {
      blendFunction: BlendFunction.SRC,
      attributes: convolution ? EffectAttribute.CONVOLUTION : EffectAttribute.NONE,
      uniforms: map,
    });
  }

  setFrame(frame: FrameInfo): void {
    this.uniforms.get('uFull')!.value.set(frame.fullWidth, frame.fullHeight);
    // Convert the top-left tile origin to a bottom-left one (uv space).
    this.uniforms
      .get('uOffset')!
      .value.set(frame.offsetX, frame.fullHeight - frame.offsetY - frame.height);
    this.uniforms.get('uPxScale')!.value = frame.pxScale;
  }

  set(name: string, value: unknown): void {
    const uniform = this.uniforms.get(name);
    if (!uniform) return;
    if (uniform.value instanceof Color && typeof value === 'string') uniform.value.set(value);
    else uniform.value = value;
  }
}

export const createAdjustEffect = () =>
  new GalbeEffect(
    'GalbeAdjust',
    /* glsl */ `
uniform float brightness;
uniform float contrast;
uniform float saturation;
uniform float hue;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = toSrgb(inputColor.rgb);
  c += brightness;
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  float y = luma(c);
  c = mix(vec3(y), c, 1.0 + saturation);
  // Hue rotation in YIQ.
  float a = radians(hue);
  mat3 toYiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312);
  mat3 toRgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703);
  vec3 yiq = toYiq * c;
  yiq.yz = rotate2(yiq.yz, a);
  c = toRgb * yiq;
  outputColor = vec4(toLinear(clamp(c, 0.0, 1.0)), inputColor.a);
}`,
    { brightness: 0, contrast: 0, saturation: 0, hue: 0 },
  );

export const createLutEffect = (lut: Data3DTexture | null) =>
  new GalbeEffect(
    'GalbeLut',
    /* glsl */ `
uniform mediump sampler3D lut;
uniform float lutSize;
uniform float intensity;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = clamp(toSrgb(inputColor.rgb), 0.0, 1.0);
  // Sample texel centres so the table's end points map exactly.
  vec3 coord = c * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize;
  vec3 graded = texture(lut, coord).rgb;
  outputColor = vec4(toLinear(mix(c, graded, intensity)), inputColor.a);
}`,
    { lut, lutSize: lut?.image.width ?? 2, intensity: 1 },
  );

export const createChromaticAberrationEffect = () =>
  new GalbeEffect(
    'GalbeChromaticAberration',
    /* glsl */ `
uniform float amount;
uniform bool radial;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = framePx(uv);
  vec2 fromCentre = (px - uFull * 0.5) / (0.5 * length(uFull));
  vec2 dir = radial ? fromCentre : vec2(1.0, 0.0);
  vec2 shift = dir * amount * uPxScale / resolution;
  float r = texture2D(inputBuffer, uv + shift).r;
  float b = texture2D(inputBuffer, uv - shift).b;
  outputColor = vec4(r, inputColor.g, b, inputColor.a);
}`,
    { amount: 4, radial: true },
    true,
  );

export const createVignetteEffect = () =>
  new GalbeEffect(
    'GalbeVignette',
    /* glsl */ `
uniform float darkness;
uniform float offset;
uniform float softness;
uniform vec3 color;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 q = framePx(uv) / uFull - 0.5;
  float d = length(q) * 1.41421356;
  float v = smoothstep(offset, offset + softness, d) * darkness;
  outputColor = vec4(mix(inputColor.rgb, color, v), max(inputColor.a, v));
}`,
    { darkness: 0.55, offset: 0.45, softness: 0.5, color: new Color('#000000') },
  );

export const createGrainEffect = () =>
  new GalbeEffect(
    'GalbeGrain',
    /* glsl */ `
uniform float amount;
uniform float size;
uniform bool monochrome;
uniform float seed;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 cell = floor(framePx(uv) / max(size * uPxScale, 1.0));
  vec2 s = vec2(seed * 17.0 + 3.1, seed * 5.3 + 11.7);
  vec3 n = monochrome
    ? vec3(hash12(cell + s))
    : vec3(hash12(cell + s), hash12(cell + s + 19.19), hash12(cell + s + 47.3));
  vec3 c = toSrgb(inputColor.rgb) + (n - 0.5) * amount;
  outputColor = vec4(toLinear(clamp(c, 0.0, 1.0)), inputColor.a);
}`,
    { amount: 0.08, size: 1.5, monochrome: true, seed: 1 },
  );

export const createPixelEffect = () =>
  new GalbeEffect(
    'GalbePixel',
    /* glsl */ `
uniform float size;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float s = max(size * uPxScale, 1.0);
  vec2 centre = (floor(framePx(uv) / s) + 0.5) * s;
  outputColor = texture2D(inputBuffer, tileUv(centre));
}`,
    { size: 8 },
    true,
  );

export const createHalftoneEffect = () =>
  new GalbeEffect(
    'GalbeHalftone',
    /* glsl */ `
uniform float mode;   // 0 mono, 1 cmyk, 2 colour dots
uniform float shape;  // 0 dot, 1 line, 2 square
uniform float size;
uniform float angle;
uniform vec3 ink;
uniform vec3 paper;
uniform float mix_;

// Coverage of one screen (rotated grid) for a channel; samples the image at the cell centre.
float screenCell(vec2 px, float cell, float a, out vec2 centrePx) {
  vec2 r = rotate2(px, -a);
  vec2 c = (floor(r / cell) + 0.5) * cell;
  centrePx = rotate2(c, a);
  return 0.0;
}
float dotMask(vec2 px, float cell, float a, float coverage) {
  vec2 r = rotate2(px, -a);
  vec2 local = r - (floor(r / cell) + 0.5) * cell;
  float aa = 1.0;
  coverage = clamp(coverage, 0.0, 1.0);
  if (shape < 0.5) {
    float radius = sqrt(coverage) * cell * 0.7071;
    return 1.0 - smoothstep(radius - aa, radius + aa, length(local));
  } else if (shape < 1.5) {
    float half_ = coverage * cell * 0.5;
    return 1.0 - smoothstep(half_ - aa, half_ + aa, abs(local.y));
  }
  float half_ = sqrt(coverage) * cell * 0.5;
  return 1.0 - smoothstep(half_ - aa, half_ + aa, max(abs(local.x), abs(local.y)));
}
vec3 sampleAt(vec2 px) { return clamp(toSrgb(texture2D(inputBuffer, tileUv(px)).rgb), 0.0, 1.0); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float cell = max(size * uPxScale, 2.0);
  vec2 px = framePx(uv);
  vec3 original = clamp(toSrgb(inputColor.rgb), 0.0, 1.0);
  vec3 result;
  vec2 centre;
  if (mode < 0.5 || mode > 1.5) {
    float a = radians(angle);
    screenCell(px, cell, a, centre);
    vec3 s = sampleAt(centre);
    float coverage = 1.0 - luma(s);
    float m = dotMask(px, cell, a, coverage);
    result = mode < 0.5 ? mix(paper, ink, m) : mix(paper, s * 0.85, m);
  } else {
    // CMYK with the classic screen angles, offset by the angle param.
    float base = radians(angle - 45.0);
    vec4 angles = vec4(15.0, 75.0, 0.0, 45.0);
    vec3 acc = paper;
    for (int i = 0; i < 4; i++) {
      float a = base + radians(angles[i]);
      screenCell(px, cell, a, centre);
      vec3 s = sampleAt(centre);
      float k = 1.0 - max(max(s.r, s.g), s.b);
      vec3 cmy = (1.0 - s - k) / max(1.0 - k, 1e-3);
      float coverage = i == 0 ? cmy.x : i == 1 ? cmy.y : i == 2 ? cmy.z : k;
      float m = dotMask(px, cell, a, coverage);
      vec3 inkColour = i == 0 ? vec3(0.0, 0.68, 0.94) : i == 1 ? vec3(0.93, 0.0, 0.55) : i == 2 ? vec3(1.0, 0.95, 0.0) : vec3(0.08);
      acc *= mix(vec3(1.0), inkColour, m);
    }
    result = acc;
  }
  outputColor = vec4(toLinear(mix(original, result, mix_)), inputColor.a);
}`,
    {
      mode: 0,
      shape: 0,
      size: 10,
      angle: 45,
      ink: new Color('#111111'),
      paper: new Color('#f4f1ea'),
      mix_: 1,
    },
    true,
  );

export const createDitherEffect = () =>
  new GalbeEffect(
    'GalbeDither',
    /* glsl */ `
uniform float pattern; // 2, 4 or 8
uniform float palette; // 0 colour, 1 mono, 2 duotone
uniform float levels;
uniform float pixelSize;
uniform vec3 dark;
uniform vec3 light;

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Whole render pixels per cell: fractional cells beat against the Bayer pattern.
  float s = max(floor(pixelSize * uPxScale + 0.5), 1.0);
  vec2 cell = floor(framePx(uv) / s);
  vec3 c = clamp(toSrgb(texture2D(inputBuffer, tileUv((cell + 0.5) * s)).rgb), 0.0, 1.0);
  float threshold = pattern < 3.0 ? bayer2(cell) : pattern < 6.0 ? bayer4(cell) : bayer8(cell);
  float steps = max(levels - 1.0, 1.0);
  vec3 result;
  if (palette < 0.5) {
    result = floor(c * steps + threshold) / steps;
  } else {
    float y = floor(luma(c) * steps + threshold) / steps;
    result = palette < 1.5 ? vec3(y) : mix(dark, light, y);
  }
  outputColor = vec4(toLinear(clamp(result, 0.0, 1.0)), inputColor.a);
}`,
    {
      pattern: 4,
      palette: 2,
      levels: 2,
      pixelSize: 2,
      dark: new Color('#14121f'),
      light: new Color('#f2efe6'),
    },
    true,
  );

/*
 * 5×7 bitmap glyphs for the ASCII ramp " .:-=+*#%@", one row per int (5 bits, MSB left).
 * Drawn for Galbe.
 */
const GLYPH_ROWS = [
  [0, 0, 0, 0, 0, 0, 0], // space
  [0, 0, 0, 0, 0, 0, 4], // .
  [0, 0, 4, 0, 0, 4, 0], // :
  [0, 0, 0, 14, 0, 0, 0], // -
  [0, 0, 31, 0, 31, 0, 0], // =
  [0, 4, 4, 31, 4, 4, 0], // +
  [0, 21, 14, 31, 14, 21, 0], // *
  [10, 10, 31, 10, 31, 10, 10], // #
  [25, 25, 2, 4, 8, 19, 19], // %
  [14, 17, 23, 21, 23, 16, 14], // @
];

export const createAsciiEffect = () =>
  new GalbeEffect(
    'GalbeAscii',
    /* glsl */ `
uniform float cell;
uniform float colorMode; // 0 original, 1 mono
uniform vec3 ink;
uniform vec3 background;
uniform bool invert;
const int GLYPHS[70] = int[70](${GLYPH_ROWS.flat().join(', ')});

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  float s = max(cell * uPxScale, 3.0);
  vec2 px = framePx(uv);
  vec2 index = floor(px / s);
  vec3 c = clamp(toSrgb(texture2D(inputBuffer, tileUv((index + 0.5) * s)).rgb), 0.0, 1.0);
  float y = luma(c);
  if (invert) y = 1.0 - y;
  int glyph = int(clamp(floor(y * 10.0), 0.0, 9.0));
  // 6×8 sub-grid per cell: a 5×7 glyph plus one column and one row of spacing.
  vec2 local = fract(px / s) * vec2(6.0, 8.0);
  int col = int(local.x);
  int row = 7 - int(local.y); // rows top to bottom
  float on = 0.0;
  if (col < 5 && row < 7 && row >= 0) {
    int bits = GLYPHS[glyph * 7 + row];
    on = float((bits >> (4 - col)) & 1);
  }
  vec3 result = colorMode < 0.5 ? c * on : mix(background, ink, on);
  outputColor = vec4(toLinear(result), inputColor.a);
}`,
    {
      cell: 12,
      colorMode: 0,
      ink: new Color('#e8ffe8'),
      background: new Color('#050805'),
      invert: false,
    },
    true,
  );

export const createGlitchEffect = () =>
  new GalbeEffect(
    'GalbeGlitch',
    /* glsl */ `
uniform float amount;
uniform float block;
uniform float split;
uniform float seed;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = framePx(uv);
  float b = max(block * uPxScale, 2.0);
  float band = floor((uFull.y - px.y) / (b * 0.35));
  float column = floor(px.x / (b * 3.0));
  float pick = hash12(vec2(band, seed));
  float hit = step(1.0 - amount * 0.6, pick);
  float blockPick = hash12(vec2(band * 0.37 + column, seed + 7.0));
  hit = max(hit, step(1.0 - amount * 0.15, blockPick));
  float shift = (hash12(vec2(band, seed + 3.0)) - 0.5) * b * 2.0 * amount * hit;
  vec2 offsetPx = vec2(shift, 0.0);
  float rgb = split * uPxScale * (0.4 + hit);
  vec2 sUv = tileUv(px + offsetPx);
  vec2 d = vec2(rgb, 0.0) / resolution;
  float r = texture2D(inputBuffer, sUv + d).r;
  vec4 g = texture2D(inputBuffer, sUv);
  float bl = texture2D(inputBuffer, sUv - d).b;
  outputColor = vec4(r, g.g, bl, g.a);
}`,
    { amount: 0.5, block: 40, split: 6, seed: 7 },
    true,
  );

/**
 * Composites a flat background colour under the (premultiplied) image after tone mapping,
 * so colour backgrounds look exactly as without effects (three never tone-maps them).
 */
/**
 * Lays the background under the rendered image after tone mapping: a flat colour, or the
 * gradient / media layer (same GLSL as the in-scene mesh, so both paths match).
 */
export function createBackgroundEffect(layer?: Record<string, Uniform<unknown>>): GalbeEffect {
  const effect = new GalbeEffect(
    'GalbeBackground',
    /* glsl */ `
uniform vec3 background;
uniform bool enabled;
uniform bool layered;
${layer ? BACKGROUND_GLSL : ''}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 under = background;
  ${
    layer
      ? `if (layered) {
    vec2 px = uOffset + uv * resolution;
    under = galbeBackground(vec2(px.x / uFull.x, 1.0 - px.y / uFull.y));
  }`
      : ''
  }
  outputColor = enabled ? vec4(inputColor.rgb + under * (1.0 - inputColor.a), 1.0) : inputColor;
}`,
    { background: new Color(), enabled: false, layered: false },
  );
  // Share the layer's uniform objects, so updating the layer updates the composite.
  if (layer) for (const [key, uniform] of Object.entries(layer)) effect.uniforms.set(key, uniform);
  return effect;
}

/**
 * Replaces NaN/∞ (half-float overflow on very bright speculars) before light-spreading
 * effects, which would otherwise smear them over the whole frame.
 */
export const createSanitizeEffect = () =>
  new GalbeEffect(
    'GalbeSanitize',
    /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec4 c = inputColor;
  if (any(isnan(c)) || any(isinf(c))) c = vec4(vec3(60000.0), 1.0);
  outputColor = clamp(c, vec4(0.0), vec4(60000.0));
}`,
    {},
  );
