import type { GalbeDocument } from '@galbe/core';
import { create } from 'zustand';

/** The document as shown in the viewport: evaluated at the playhead. */
export const useEvaluatedStore = create<{ doc: GalbeDocument | null; time: number }>()(() => ({
  doc: null,
  time: 0,
}));
