import { BevelSchema, DeformSchema } from '@galbe/core';
import { ShapeUtils } from 'three';
import { describe, expect, it } from 'vitest';
import { fontRefKey } from '../src/fonts/FontLibrary.ts';
import { soupBounds, vertexCount } from '../src/geometry/soup.ts';
import { buildTextSoup, type TextGeometryParams } from '../src/text/buildTextGeometry.ts';
import { layoutText, splitRuns } from '../src/text/layout.ts';
import { glyphShapes } from '../src/text/outline.ts';
import { fontRef, loadFace } from './helpers.ts';

const params = (overrides: Partial<TextGeometryParams> = {}): TextGeometryParams => ({
  text: 'Galbe',
  size: 1,
  depth: 0.3,
  curveSegments: 6,
  bevel: BevelSchema.parse({}),
  letterSpacing: 0,
  lineHeight: 1.1,
  align: 'center',
  deform: DeformSchema.parse({}),
  ...overrides,
});

describe('font loading', () => {
  it('loads a two-subset face', async () => {
    const face = await loadFace();
    expect(face.fonts).toHaveLength(2);
    expect(face.key).toBe(fontRefKey(fontRef('inter', 900)));
  });

  it('falls back to the Latin Extended subset per character', async () => {
    const face = await loadFace();
    const runs = splitRuns(face.fonts, 'Łódź');
    expect(runs.map((run) => run.fontIndex)).toEqual([1, 0, 1]);
    expect(runs.map((run) => run.text).join('')).toBe('Łódź');
  });
});

describe('layout', () => {
  it('applies letter spacing and alignment', async () => {
    const face = await loadFace();
    const tight = layoutText('HH', face, {
      size: 1,
      letterSpacing: 0,
      lineHeight: 1,
      align: 'left',
    });
    const loose = layoutText('HH', face, {
      size: 1,
      letterSpacing: 0.5,
      lineHeight: 1,
      align: 'left',
    });
    expect(loose.width - tight.width).toBeCloseTo(0.5, 5);
    const centered = layoutText('HH', face, {
      size: 1,
      letterSpacing: 0,
      lineHeight: 1,
      align: 'center',
    });
    expect(centered.glyphs[0]!.x).toBeCloseTo(-tight.width / 2, 5);
    const right = layoutText('HH', face, {
      size: 1,
      letterSpacing: 0,
      lineHeight: 1,
      align: 'right',
    });
    expect(right.glyphs[0]!.x).toBeCloseTo(-tight.width, 5);
  });

  it.each([
    ['inter', 400],
    ['playfair-display', 700],
    ['dm-serif-display', 400],
    ['space-grotesk', 700],
  ] as const)('kerns "AV" in %s (GPOS, incl. extension lookups)', async (family, weight) => {
    const face = await loadFace(family, weight);
    const pair = layoutText('AV', face, {
      size: 1,
      letterSpacing: 0,
      lineHeight: 1,
      align: 'left',
    });
    const a = layoutText('A', face, { size: 1, letterSpacing: 0, lineHeight: 1, align: 'left' });
    const v = layoutText('V', face, { size: 1, letterSpacing: 0, lineHeight: 1, align: 'left' });
    expect(pair.width).toBeLessThan(a.width + v.width - 0.01);
  });

  it('stacks lines by line height', async () => {
    const face = await loadFace();
    const layout = layoutText('A\nB\nC', face, {
      size: 2,
      letterSpacing: 0,
      lineHeight: 1.25,
      align: 'center',
    });
    expect(layout.lines.map((line) => line.baseline)).toEqual([0, -2.5, -5]);
    expect(new Set(layout.glyphs.map((glyph) => glyph.line))).toEqual(new Set([0, 1, 2]));
  });

  it('numbers drawable glyphs in order, skipping spaces', async () => {
    const face = await loadFace();
    const layout = layoutText('a b', face, {
      size: 1,
      letterSpacing: 0,
      lineHeight: 1,
      align: 'left',
    });
    expect(layout.glyphs.map((glyph) => glyph.order)).toEqual([0, 0, 1]);
  });
});

describe('outlines', () => {
  it('detects holes in TrueType glyphs', async () => {
    const face = await loadFace();
    const font = face.fonts[0]!;
    const o = glyphShapes(font.charToGlyph('O').path.commands, 1 / font.unitsPerEm);
    expect(o).toHaveLength(1);
    expect(o[0]!.holes).toHaveLength(1);
    const b = glyphShapes(font.charToGlyph('B').path.commands, 1 / font.unitsPerEm);
    expect(b[0]!.holes).toHaveLength(2);
    const i = glyphShapes(font.charToGlyph('i').path.commands, 1 / font.unitsPerEm);
    expect(i).toHaveLength(2);
    expect(i.every((shape) => shape.holes.length === 0)).toBe(true);
    const percent = glyphShapes(font.charToGlyph('%').path.commands, 1 / font.unitsPerEm);
    expect(percent.reduce((n, shape) => n + shape.holes.length, 0)).toBe(2);
  });

  it('merges overlapping and self-intersecting contours (non-zero fill)', async () => {
    // Static instances of variable fonts keep overlaps: Unbounded's "L" is one
    // self-intersecting contour, and "R" is two overlapping solids.
    const face = await loadFace('unbounded', 900);
    const font = face.fonts[0]!;
    const l = glyphShapes(font.charToGlyph('L').path.commands, 1 / font.unitsPerEm);
    expect(l).toHaveLength(1);
    expect(l[0]!.holes).toHaveLength(0);
    const r = glyphShapes(font.charToGlyph('R').path.commands, 1 / font.unitsPerEm);
    expect(r).toHaveLength(1);
    expect(r[0]!.holes).toHaveLength(1);
    // The merged outline has no duplicate area: its signed area equals the union area.
    const area = Math.abs(ShapeUtils.area(r[0]!.getPoints()));
    expect(area).toBeGreaterThan(0.3);
    expect(area).toBeLessThan(0.408 + 0.102);
  });
});

describe('text geometry', () => {
  it('builds a centred, extruded mesh', async () => {
    const face = await loadFace();
    const result = buildTextSoup(face, params());
    expect(result.glyphCount).toBe(5);
    expect(vertexCount(result.soup) % 3).toBe(0);
    const { min, max } = soupBounds(result.soup);
    for (let axis = 0; axis < 3; axis++) expect(min[axis]! + max[axis]!).toBeCloseTo(0, 4);
    // depth + 2 × bevel thickness
    expect(max[2] - min[2]).toBeCloseTo(0.3 + 2 * 0.03, 3);
  });

  it('produces unit normals and no NaNs', async () => {
    const face = await loadFace();
    const { soup } = buildTextSoup(
      face,
      params({ deform: DeformSchema.parse({ twist: { enabled: true, angle: 180 } }) }),
    );
    for (let i = 0; i < soup.normal.length; i += 3) {
      const len = Math.hypot(soup.normal[i]!, soup.normal[i + 1]!, soup.normal[i + 2]!);
      expect(Number.isFinite(soup.position[i]!)).toBe(true);
      expect(len).toBeCloseTo(1, 3);
    }
  });

  it('keeps front faces facing +Z and back faces facing -Z', async () => {
    const face = await loadFace();
    const { soup } = buildTextSoup(face, params({ bevel: BevelSchema.parse({ enabled: false }) }));
    const { min, max } = soupBounds(soup);
    let front = 0;
    let back = 0;
    for (let t = 0; t < soup.position.length / 9; t++) {
      const zs = [0, 1, 2].map((k) => soup.position[(t * 3 + k) * 3 + 2]!);
      const nz = soup.normal[t * 9 + 2]!;
      if (zs.every((z) => Math.abs(z - max[2]) < 1e-5)) {
        expect(nz).toBeGreaterThan(0.99);
        front++;
      } else if (zs.every((z) => Math.abs(z - min[2]) < 1e-5)) {
        expect(nz).toBeLessThan(-0.99);
        back++;
      }
    }
    expect(front).toBeGreaterThan(0);
    expect(back).toBe(front);
  });

  it('bends text into an arch', async () => {
    const face = await loadFace();
    const flat = buildTextSoup(face, params({ text: 'ARCH' }));
    const bent = buildTextSoup(
      face,
      params({ text: 'ARCH', deform: DeformSchema.parse({ bend: { enabled: true, angle: 90 } }) }),
    );
    expect(bent.soup.position.length).toBeGreaterThan(flat.soup.position.length);
    // The ends drop below the centre, so the block gets taller.
    const fb = soupBounds(flat.soup);
    const bb = soupBounds(bent.soup);
    expect(bb.max[1] - bb.min[1]).toBeGreaterThan((fb.max[1] - fb.min[1]) * 1.2);
    // A negative angle bends the other way (the centre drops instead).
    const inverted = buildTextSoup(
      face,
      params({ text: 'ARCH', deform: DeformSchema.parse({ bend: { enabled: true, angle: -90 } }) }),
    );
    const ib = soupBounds(inverted.soup);
    expect(ib.max[1] - ib.min[1]).toBeCloseTo(bb.max[1] - bb.min[1], 1);
  });

  it('stays watertight after deformation (no T-junction cracks)', async () => {
    const face = await loadFace();
    const { soup } = buildTextSoup(
      face,
      params({
        text: 'O',
        bevel: BevelSchema.parse({ enabled: false }),
        deform: DeformSchema.parse({ wave: { enabled: true, amplitude: 0.3, frequency: 2 } }),
      }),
    );
    // Every edge of a closed manifold appears exactly twice (once per direction).
    const key = (i: number) =>
      `${soup.position[i * 3]!.toFixed(5)},${soup.position[i * 3 + 1]!.toFixed(5)},${soup.position[i * 3 + 2]!.toFixed(5)}`;
    const edges = new Map<string, number>();
    for (let t = 0; t < soup.position.length / 9; t++) {
      for (let e = 0; e < 3; e++) {
        const a = key(t * 3 + e);
        const b = key(t * 3 + ((e + 1) % 3));
        const id = a < b ? `${a}|${b}` : `${b}|${a}`;
        edges.set(id, (edges.get(id) ?? 0) + 1);
      }
    }
    const open = [...edges.values()].filter((count) => count !== 2).length;
    expect(open).toBe(0);
  });

  it('reuses cached glyphs for repeated letters', async () => {
    const face = await loadFace();
    const { GlyphCache } = await import('../src/text/glyphGeometry.ts');
    const cache = new GlyphCache();
    buildTextSoup(face, params({ text: 'aaaa' }), cache);
    expect(cache.size).toBe(1);
  });

  it('handles empty and whitespace-only text', async () => {
    const face = await loadFace();
    expect(buildTextSoup(face, params({ text: '' })).glyphCount).toBe(0);
    expect(buildTextSoup(face, params({ text: '  \n ' })).glyphCount).toBe(0);
  });

  it('renders CFF-free serif and script faces', async () => {
    for (const [family, weight, style] of [
      ['playfair-display', 900, 'italic'],
      ['pacifico', 400, 'normal'],
      ['dm-serif-display', 400, 'normal'],
    ] as const) {
      const face = await loadFace(family, weight, style);
      expect(buildTextSoup(face, params({ text: 'Ég&8' })).glyphCount).toBe(4);
    }
  });
});
