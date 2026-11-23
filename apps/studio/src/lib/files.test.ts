import { describe, expect, it } from 'vitest';
import { slugify } from './files.ts';

describe('slugify', () => {
  it.each([
    ['Summer Drop 2026!', 'summer-drop-2026'],
    ['Éclat — été', 'eclat-ete'],
    ['   ', 'galbe'],
  ])('%j → %j', (input, expected) => expect(slugify(input)).toBe(expected));
});
