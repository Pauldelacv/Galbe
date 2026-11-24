import type { Easing } from '../schema/animation.ts';

/** Solves a CSS cubic-bezier(x1, y1, x2, y2) timing function for progress `x`. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  // Newton–Raphson, then bisection when the slope is too flat.
  let t = x;
  for (let i = 0; i < 8; i++) {
    const error = sampleX(t) - x;
    if (Math.abs(error) < 1e-6) return sampleY(t);
    const slope = slopeX(t);
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i++) {
    const value = sampleX(t);
    if (Math.abs(value - x) < 1e-7) break;
    if (value < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return sampleY(t);
}

const BACK = 1.70158;

function bounceOut(x: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x - 1.5 / d) ** 2 + 0.75;
  if (x < 2.5 / d) return n * (x - 2.25 / d) ** 2 + 0.9375;
  return n * (x - 2.625 / d) ** 2 + 0.984375;
}

/** Applies an easing to progress `x` in [0, 1]. Some curves overshoot (back, elastic). */
export function ease(easing: Easing, x: number): number {
  const u = Math.min(1, Math.max(0, x));
  if (u === 0) return 0;
  if (u === 1) return 1;
  if (Array.isArray(easing)) return cubicBezier(easing[0], easing[1], easing[2], easing[3], u);
  switch (easing) {
    case 'linear':
      return u;
    case 'hold':
      return u >= 1 ? 1 : 0;
    case 'easeIn':
      return cubicBezier(0.42, 0, 1, 1, u);
    case 'easeOut':
      return cubicBezier(0, 0, 0.58, 1, u);
    case 'easeInOut':
      return cubicBezier(0.42, 0, 0.58, 1, u);
    case 'easeInCubic':
      return u * u * u;
    case 'easeOutCubic':
      return 1 - (1 - u) ** 3;
    case 'easeInOutCubic':
      return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    case 'easeOutBack':
      return 1 + (BACK + 1) * (u - 1) ** 3 + BACK * (u - 1) ** 2;
    case 'easeInOutBack': {
      const c = BACK * 1.525;
      return u < 0.5
        ? ((2 * u) ** 2 * ((c + 1) * 2 * u - c)) / 2
        : ((2 * u - 2) ** 2 * ((c + 1) * (u * 2 - 2) + c) + 2) / 2;
    }
    case 'easeOutElastic':
      return u === 0 || u === 1
        ? u
        : 2 ** (-10 * u) * Math.sin((u * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
    case 'easeOutBounce':
      return bounceOut(u);
  }
}

/** 0 → 1 → 0 over [0, 1]: makes any one-way motion loop seamlessly. */
export const pingPong = (x: number): number => (x < 0.5 ? x * 2 : 2 - x * 2);

export const EASING_LABELS: Record<Exclude<Easing, readonly number[]> & string, string> = {
  linear: 'Linear',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  easeInCubic: 'Ease in (strong)',
  easeOutCubic: 'Ease out (strong)',
  easeInOutCubic: 'Ease in-out (strong)',
  easeOutBack: 'Overshoot',
  easeInOutBack: 'Anticipate',
  easeOutElastic: 'Elastic',
  easeOutBounce: 'Bounce',
  hold: 'Hold',
};
