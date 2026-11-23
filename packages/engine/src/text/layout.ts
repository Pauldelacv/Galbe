import type { Font, Glyph, KerningLookups } from 'opentype.js';
import { kernerFor, type LoadedFace } from '../fonts/FontLibrary.ts';

export interface LayoutOptions {
  /** Em size in scene units. */
  size: number;
  /** Extra space between glyphs, in em. */
  letterSpacing: number;
  /** Baseline-to-baseline distance, in em. */
  lineHeight: number;
  align: 'left' | 'center' | 'right';
}

export interface PlacedGlyph {
  fontIndex: number;
  font: Font;
  glyph: Glyph;
  /** Origin of the glyph (baseline, left side bearing origin), scene units. */
  x: number;
  y: number;
  line: number;
  /** Order among drawable glyphs, used for per-letter effects. */
  order: number;
}

export interface TextLayout {
  glyphs: PlacedGlyph[];
  lines: { width: number; baseline: number; offset: number }[];
  /** Width of the widest line. */
  width: number;
}

const kerningCache = new WeakMap<Font, KerningLookups | null>();

function kerningLookups(font: Font): KerningLookups | null {
  let lookups = kerningCache.get(font);
  if (lookups === undefined) {
    try {
      lookups = font.position.getKerningTables(font.position.getDefaultScriptName()) ?? null;
    } catch {
      lookups = null;
    }
    kerningCache.set(font, lookups);
  }
  return lookups;
}

export function kerning(font: Font, left: Glyph, right: Glyph): number {
  const kerner = kernerFor(font);
  if (kerner) return kerner(left.index, right.index);
  try {
    const lookups = kerningLookups(font);
    return lookups
      ? font.position.getKerningValue(lookups, left.index, right.index)
      : font.getKerningValue(left, right);
  } catch {
    return 0;
  }
}

const shapingBroken = new WeakSet<Font>();

/**
 * Glyphs for a run. Uses opentype.js shaping (ligatures) when the font's GSUB tables are
 * supported, and falls back to a plain character → glyph mapping otherwise.
 */
export function shapeRun(font: Font, text: string): Glyph[] {
  if (!shapingBroken.has(font)) {
    try {
      return font.stringToGlyphs(text);
    } catch {
      shapingBroken.add(font);
    }
  }
  return Array.from(text, (char) => font.charToGlyph(char));
}

/** Index of the first font in the face that has `char`, or 0 (shows .notdef). */
export function fontIndexFor(fonts: Font[], char: string): number {
  if (/\s/.test(char)) {
    const index = fonts.findIndex((font) => font.hasChar(char));
    return index === -1 ? 0 : index;
  }
  for (let i = 0; i < fonts.length; i++) if (fonts[i]!.hasChar(char)) return i;
  return 0;
}

/** Splits a line into runs of consecutive characters rendered by the same font. */
export function splitRuns(fonts: Font[], line: string): { fontIndex: number; text: string }[] {
  const runs: { fontIndex: number; text: string }[] = [];
  for (const char of line) {
    const fontIndex = fontIndexFor(fonts, char);
    const last = runs.at(-1);
    if (last && last.fontIndex === fontIndex) last.text += char;
    else runs.push({ fontIndex, text: char });
  }
  return runs;
}

/**
 * Lays out multi-line text. Applies GSUB ligatures (per font run), GPOS/kern kerning,
 * letter spacing, line height and alignment. Baseline of the first line is y = 0.
 */
export function layoutText(text: string, face: LoadedFace, options: LayoutOptions): TextLayout {
  const { size, letterSpacing, lineHeight, align } = options;
  const spacing = letterSpacing * size;
  const glyphs: PlacedGlyph[] = [];
  const lines: TextLayout['lines'] = [];
  let order = 0;

  text.split(/\r?\n/).forEach((line, lineIndex) => {
    const baseline = 0 - lineIndex * lineHeight * size;
    const lineGlyphs: PlacedGlyph[] = [];
    let x = 0;
    let previous: { font: Font; glyph: Glyph } | null = null;

    for (const run of splitRuns(face.fonts, line)) {
      const font = face.fonts[run.fontIndex]!;
      const scale = size / font.unitsPerEm;
      for (const glyph of shapeRun(font, run.text)) {
        if (previous) {
          x += spacing;
          if (previous.font === font) x += kerning(font, previous.glyph, glyph) * scale;
        }
        lineGlyphs.push({
          fontIndex: run.fontIndex,
          font,
          glyph,
          x,
          y: baseline,
          line: lineIndex,
          order: 0,
        });
        x += (glyph.advanceWidth ?? 0) * scale;
        previous = { font, glyph };
      }
    }

    const width = x;
    const offset = align === 'left' ? 0 : align === 'center' ? -width / 2 : -width;
    for (const placed of lineGlyphs) {
      placed.x += offset;
      if (placed.glyph.path.commands.length) placed.order = order++;
      glyphs.push(placed);
    }
    lines.push({ width, baseline, offset });
  });

  return { glyphs, lines, width: Math.max(0, ...lines.map((line) => line.width)) };
}
