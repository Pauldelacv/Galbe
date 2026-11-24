import { create } from 'zustand';
import { useDocumentStore } from './documentStore.ts';

export type GizmoMode = 'translate' | 'rotate' | 'scale';
export type DialogId = 'export' | 'projects' | 'shortcuts' | null;
export type GridGuide = 'off' | 'thirds' | 'columns' | 'golden';

export interface Guides {
  /** Title- and action-safe margins (and platform UI zones for 9:16). */
  safe: boolean;
  grid: GridGuide;
  /** Columns of the `columns` grid. */
  columns: number;
  center: boolean;
}

export interface UiState {
  selection: string[];
  gizmo: GizmoMode;
  panels: { left: boolean; right: boolean };
  /** >0 while the user drags something; the viewport lowers its resolution meanwhile. */
  interacting: number;
  dialog: DialogId;
  /** Bumped to ask the text inspector to focus its text area. */
  focusTextRequest: number;
  saveState: { status: 'idle' | 'saving' | 'saved' | 'error'; at?: number; message?: string };
  /** Inspector tab. */
  inspectorTab: 'layer' | 'scene' | 'cover' | 'effects';
  /** Overlay being edited in the Cover tab. */
  activeOverlay: string | null;
  guides: Guides;
  /** Left panel tab. */
  leftTab: 'layers' | 'history';
  /** Effect whose params are expanded in the effects panel. */
  expandedEffect: string | null;
  /** Path selected inside a shape (its material is edited). */
  activePath: string | null;

  select: (ids: string[], mode?: 'replace' | 'toggle') => void;
  setGizmo: (mode: GizmoMode) => void;
  togglePanel: (panel: 'left' | 'right') => void;
  setInteracting: (on: boolean) => void;
  openDialog: (dialog: DialogId) => void;
  requestTextFocus: () => void;
  setInspectorTab: (tab: UiState['inspectorTab']) => void;
  setLeftTab: (tab: UiState['leftTab']) => void;
  setExpandedEffect: (id: string | null) => void;
  setActivePath: (id: string | null) => void;
  setActiveOverlay: (id: string | null) => void;
  setGuides: (guides: Partial<Guides>) => void;
}

const GUIDES_KEY = 'galbe:guides';
function readGuides(): Guides {
  const fallback: Guides = { safe: false, grid: 'off', columns: 6, center: false };
  try {
    return { ...fallback, ...(JSON.parse(localStorage.getItem(GUIDES_KEY) ?? '{}') as object) };
  } catch {
    return fallback;
  }
}

export const useUiStore = create<UiState>()((set) => ({
  selection: [],
  gizmo: 'translate',
  panels: { left: true, right: true },
  interacting: 0,
  dialog: null,
  focusTextRequest: 0,
  saveState: { status: 'idle' },
  inspectorTab: 'layer',
  leftTab: 'layers',
  expandedEffect: null,
  activePath: null,
  activeOverlay: null,
  guides: readGuides(),

  select: (ids, mode = 'replace') =>
    set((state) => {
      if (mode === 'replace') return { selection: ids, activePath: null };
      const next = new Set(state.selection);
      for (const id of ids) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      }
      return { selection: [...next] };
    }),
  setGizmo: (gizmo) => set({ gizmo }),
  togglePanel: (panel) =>
    set((state) => ({ panels: { ...state.panels, [panel]: !state.panels[panel] } })),
  setInteracting: (on) =>
    set((state) => ({ interacting: Math.max(0, state.interacting + (on ? 1 : -1)) })),
  openDialog: (dialog) => set({ dialog }),
  requestTextFocus: () => set((state) => ({ focusTextRequest: state.focusTextRequest + 1 })),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setLeftTab: (leftTab) => set({ leftTab }),
  setExpandedEffect: (expandedEffect) =>
    set({
      expandedEffect,
      inspectorTab: expandedEffect ? 'effects' : useUiStore.getState().inspectorTab,
    }),
  setActivePath: (activePath) => set({ activePath }),
  setActiveOverlay: (activeOverlay) => set({ activeOverlay }),
  setGuides: (guides) =>
    set((state) => {
      const next = { ...state.guides, ...guides };
      try {
        localStorage.setItem(GUIDES_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: keep guides for this session only.
      }
      return { guides: next };
    }),
}));

// Drop selected ids that no longer exist (after undo, delete, project switch).
useDocumentStore.subscribe((state, previous) => {
  if (state.doc.nodes === previous.doc.nodes) return;
  const ids = new Set(state.doc.nodes.map((node) => node.id));
  const { selection } = useUiStore.getState();
  const kept = selection.filter((id) => ids.has(id));
  if (kept.length !== selection.length) useUiStore.setState({ selection: kept });
});

/** Wraps a drag-like gesture: one undo step and reduced viewport quality meanwhile. */
export const gesture = {
  begin(label: string) {
    useDocumentStore.getState().begin(label);
    useUiStore.getState().setInteracting(true);
  },
  end() {
    useDocumentStore.getState().end();
    useUiStore.getState().setInteracting(false);
  },
};
