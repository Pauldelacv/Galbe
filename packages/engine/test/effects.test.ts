import { EFFECT_DEFINITIONS } from '@galbe/core';
import { describe, expect, it } from 'vitest';
import { BUILTIN_LUT_IDS, builtinLut, parseCubeLut } from '../src/effects/luts.ts';
import { hasEffectImplementation } from '../src/effects/PostStack.ts';

describe('LUTs', () => {
  it('parses .cube files', () => {
    const lines = [
      'TITLE "Test"',
      '# comment',
      'LUT_3D_SIZE 2',
      'DOMAIN_MIN 0 0 0',
      'DOMAIN_MAX 1 1 1',
    ];
    for (let b = 0; b < 2; b++)
      for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) lines.push(`${r} ${g} ${b * 0.5}`);
    const lut = parseCubeLut(lines.join('\n'));
    expect(lut.size).toBe(2);
    expect(lut.title).toBe('Test');
    expect(Array.from(lut.data.slice(-3))).toEqual([1, 1, 0.5]);
  });

  it('rejects broken files', () => {
    expect(() => parseCubeLut('LUT_3D_SIZE 2\n0 0 0')).toThrow(/expected 8/);
    expect(() => parseCubeLut('LUT_1D_SIZE 16')).toThrow(/1D/);
  });

  it('computes every built-in look in range', () => {
    for (const id of BUILTIN_LUT_IDS) {
      const lut = builtinLut(id, 9)!;
      expect(lut.data.length).toBe(9 ** 3 * 3);
      expect(Math.min(...lut.data)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...lut.data)).toBeLessThanOrEqual(1);
    }
  });
});

describe('effect registry', () => {
  it('implements every built-in effect definition', () => {
    for (const definition of EFFECT_DEFINITIONS)
      expect(hasEffectImplementation(definition.type), definition.type).toBe(true);
  });
});
