import { describe, expect, it } from 'vitest';
import { evaluateExpression, formatNumber, roundTo } from './expression.ts';

describe('evaluateExpression', () => {
  it.each([
    ['12.5', 12.5],
    ['2*3+1', 7],
    ['(10 - 4) / 3', 2],
    ['-0.5', -0.5],
    ['--2', 2],
    ['1,5', 1.5],
    ['1e2', 100],
  ])('%s = %d', (input, expected) => {
    expect(evaluateExpression(input)).toBeCloseTo(expected, 10);
  });

  it('applies leading operators to the current value', () => {
    expect(evaluateExpression('*2', 3)).toBe(6);
    expect(evaluateExpression('/4', 10)).toBe(2.5);
    expect(evaluateExpression('+1', 10)).toBe(11);
    expect(evaluateExpression('-1', 10)).toBe(-1); // a leading minus is a negative number
  });

  it.each(['', 'abc', '2*', '(1', '1/0', 'alert(1)'])('rejects %j', (input) => {
    expect(evaluateExpression(input)).toBeNull();
  });
});

describe('number formatting', () => {
  it('rounds without floating noise', () => {
    expect(roundTo(0.1 + 0.2, 3)).toBe(0.3);
    expect(formatNumber(-0.0001, 2)).toBe('0');
  });
});
