import { describe, expect, it } from 'vitest';
import { sniffBytes } from './fileKind.ts';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === 'string' ? [...value].map((c) => c.charCodeAt(0)) : [value],
    ),
  );

describe('sniffBytes', () => {
  it.each([
    [bytes(0x50, 0x4b, 0x03, 0x04), 'galbe'],
    [bytes(0, 1, 0, 0), 'font'],
    [bytes('OTTO'), 'font'],
    [bytes('wOFF'), 'font'],
    [bytes('wOF2'), 'woff2'],
    [bytes('#?RADIANCE'), 'hdri'],
    [bytes('glTF'), 'model'],
    [bytes('hello'), 'unknown'],
  ])('%o → %s', (input, kind) => expect(sniffBytes(input)).toBe(kind));
});
