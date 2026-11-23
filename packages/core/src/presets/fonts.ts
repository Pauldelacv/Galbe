import type { FontRef } from '../schema/nodes.ts';

/**
 * Default face for new text. Files are builtin font subsets shipped by `@galbe/assets`
 * (`builtin:fonts/<family>/<subset>-<weight>-<style>`).
 */
export const DEFAULT_FONT: FontRef = {
  family: 'Inter',
  weight: 900,
  style: 'normal',
  files: ['builtin:fonts/inter/latin-900-normal', 'builtin:fonts/inter/latin-ext-900-normal'],
};
