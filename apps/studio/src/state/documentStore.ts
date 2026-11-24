import { createStarterDocument, type GalbeDocument } from '@galbe/core';
import { type Draft, produce } from 'immer';
import { create } from 'zustand';

const HISTORY_LIMIT = 200;
const COALESCE_WINDOW_MS = 1200;

export interface UpdateOptions {
  /** Shown in the history (future history panel). */
  label?: string;
  /** false = do not record an undo step (camera moves, selection-like edits). */
  history?: boolean;
  /**
   * Consecutive updates with the same key inside a short window merge into one undo step
   * (keyboard nudges, typing in a text field).
   */
  coalesce?: string;
}

interface HistoryEntry {
  doc: GalbeDocument;
  label: string;
}

export interface DocumentState {
  doc: GalbeDocument;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Open transaction (slider or gizmo drag): updates apply live, one undo step at the end. */
  transaction: { base: GalbeDocument; label: string; depth: number } | null;
  lastCoalesce: { key: string; at: number } | null;
  /** Increments on every document change; used by autosave. */
  revision: number;

  /** Replaces the document and clears history (opening a project). */
  load: (doc: GalbeDocument) => void;
  update: (recipe: (draft: Draft<GalbeDocument>) => void, options?: UpdateOptions) => void;
  begin: (label?: string) => void;
  end: () => void;
  undo: () => void;
  redo: () => void;
  /** Moves through history: negative = undo that many steps, positive = redo. */
  step: (delta: number) => void;
}

const pushPast = (past: HistoryEntry[], entry: HistoryEntry) => [
  ...past.slice(-(HISTORY_LIMIT - 1)),
  entry,
];

/** Restoring a snapshot keeps the current camera: orbiting is not an undoable edit. */
const restore = (snapshot: GalbeDocument, current: GalbeDocument): GalbeDocument =>
  snapshot.camera === current.camera ? snapshot : { ...snapshot, camera: current.camera };

export const useDocumentStore = create<DocumentState>()((set, get) => ({
  doc: createStarterDocument(),
  past: [],
  future: [],
  transaction: null,
  lastCoalesce: null,
  revision: 0,

  load: (doc) =>
    set((state) => ({
      doc,
      past: [],
      future: [],
      transaction: null,
      lastCoalesce: null,
      revision: state.revision + 1,
    })),

  update: (recipe, options = {}) => {
    const state = get();
    const next = produce(state.doc, recipe);
    if (next === state.doc) return;
    const label = options.label ?? 'Edit';
    if (state.transaction || options.history === false) {
      set({ doc: next, revision: state.revision + 1 });
      return;
    }
    const now = Date.now();
    const coalesce =
      options.coalesce !== undefined &&
      state.lastCoalesce?.key === options.coalesce &&
      now - state.lastCoalesce.at < COALESCE_WINDOW_MS &&
      state.past.length > 0;
    set({
      doc: next,
      past: coalesce ? state.past : pushPast(state.past, { doc: state.doc, label }),
      future: [],
      lastCoalesce: options.coalesce !== undefined ? { key: options.coalesce, at: now } : null,
      revision: state.revision + 1,
    });
  },

  begin: (label = 'Edit') =>
    set((state) =>
      state.transaction
        ? { transaction: { ...state.transaction, depth: state.transaction.depth + 1 } }
        : { transaction: { base: state.doc, label, depth: 1 } },
    ),

  end: () =>
    set((state) => {
      const transaction = state.transaction;
      if (!transaction) return {};
      if (transaction.depth > 1)
        return { transaction: { ...transaction, depth: transaction.depth - 1 } };
      if (transaction.base === state.doc) return { transaction: null };
      return {
        transaction: null,
        past: pushPast(state.past, { doc: transaction.base, label: transaction.label }),
        future: [],
        lastCoalesce: null,
      };
    }),

  undo: () => {
    get().end();
    const state = get();
    const entry = state.past.at(-1);
    if (!entry) return;
    set({
      doc: restore(entry.doc, state.doc),
      past: state.past.slice(0, -1),
      future: [{ doc: state.doc, label: entry.label }, ...state.future],
      lastCoalesce: null,
      revision: state.revision + 1,
    });
  },

  step: (delta) => {
    for (let i = 0; i < Math.abs(delta); i++) {
      if (delta < 0) get().undo();
      else get().redo();
    }
  },

  redo: () => {
    get().end();
    const state = get();
    const entry = state.future[0];
    if (!entry) return;
    set({
      doc: restore(entry.doc, state.doc),
      past: pushPast(state.past, { doc: state.doc, label: entry.label }),
      future: state.future.slice(1),
      lastCoalesce: null,
      revision: state.revision + 1,
    });
  },
}));

/** Shorthand for non-React code. */
export const documentApi = {
  get: () => useDocumentStore.getState().doc,
  update: (recipe: (draft: Draft<GalbeDocument>) => void, options?: UpdateOptions) =>
    useDocumentStore.getState().update(recipe, options),
};
