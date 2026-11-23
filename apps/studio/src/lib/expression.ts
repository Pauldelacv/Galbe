/**
 * Evaluates the small arithmetic expressions designers type into number fields:
 * `12.5`, `2*3+1`, `(10 - 4) / 3`, `-0.5`. A leading operator applies to the current
 * value: `*2` doubles it, `+10` adds 10, `/4` divides it. Returns null on invalid input.
 * No `eval`: a tiny recursive-descent parser.
 */
export function evaluateExpression(input: string, current?: number): number | null {
  let source = input.trim().replace(/,/g, '.');
  if (!source) return null;
  if (current !== undefined && /^[*/]/.test(source)) source = `${current}${source}`;
  else if (current !== undefined && /^[+]/.test(source)) source = `${current}${source}`;

  let pos = 0;
  const peek = () => source[pos];
  const skip = () => {
    while (source[pos] === ' ') pos++;
  };

  const parseNumber = (): number | null => {
    skip();
    const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(pos));
    if (!match) return null;
    pos += match[0].length;
    return Number(match[0]);
  };
  const parseFactor = (): number | null => {
    skip();
    const char = peek();
    if (char === '-' || char === '+') {
      pos++;
      const value = parseFactor();
      return value === null ? null : char === '-' ? -value : value;
    }
    if (char === '(') {
      pos++;
      const value = parseSum();
      skip();
      if (peek() !== ')') return null;
      pos++;
      return value;
    }
    return parseNumber();
  };
  const parseProduct = (): number | null => {
    let value = parseFactor();
    while (value !== null) {
      skip();
      const op = peek();
      if (op !== '*' && op !== '/') break;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      value = op === '*' ? value * right : value / right;
    }
    return value;
  };
  function parseSum(): number | null {
    let value = parseProduct();
    while (value !== null) {
      skip();
      const op = peek();
      if (op !== '+' && op !== '-') break;
      pos++;
      const right = parseProduct();
      if (right === null) return null;
      value = op === '+' ? value + right : value - right;
    }
    return value;
  }

  const result = parseSum();
  skip();
  if (result === null || pos !== source.length || !Number.isFinite(result)) return null;
  return result;
}

export const clamp = (value: number, min = -Infinity, max = Infinity): number =>
  Math.min(max, Math.max(min, value));

/** Rounds to a number of decimals without floating noise (0.1 + 0.2 → 0.3). */
export const roundTo = (value: number, decimals: number): number => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

export const formatNumber = (value: number, decimals: number): string => {
  const rounded = roundTo(value, decimals);
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
