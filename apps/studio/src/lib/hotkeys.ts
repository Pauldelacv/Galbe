import {
  addText,
  deleteSelection,
  duplicateSelection,
  frameSelection,
  redo,
  toggleSelectionVisibility,
  undo,
} from '../state/actions.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { groupSelection, ungroupSelection } from '../state/objectActions.ts';
import { deleteSelectedKeys, usePlaybackStore } from '../state/playbackStore.ts';
import { useUiStore } from '../state/uiStore.ts';

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const MOD = isMac ? '⌘' : 'Ctrl';

export interface Hotkey {
  id: string;
  group: 'General' | 'Edit' | 'Viewport' | 'Panels' | 'Timeline';
  keys: string[];
  description: string;
  match: (event: KeyboardEvent) => boolean;
  run: () => void;
}

const mod = (event: KeyboardEvent) => (isMac ? event.metaKey : event.ctrlKey);
const plain = (event: KeyboardEvent) => !event.metaKey && !event.ctrlKey && !event.altKey;
const key = (event: KeyboardEvent, value: string) => event.key.toLowerCase() === value;

/** Single source of truth for shortcuts: drives the handler and the cheat sheet. */
export function createHotkeys(actions: { saveFile: () => void; openFile: () => void }): Hotkey[] {
  const ui = () => useUiStore.getState();
  const playback = () => usePlaybackStore.getState();
  return [
    {
      id: 'add-text',
      group: 'General',
      keys: ['T'],
      description: 'Add text',
      match: (e) => plain(e) && key(e, 't'),
      run: () => addText(),
    },
    {
      id: 'export',
      group: 'General',
      keys: [MOD, 'E'],
      description: 'Export image or video',
      match: (e) => mod(e) && !e.shiftKey && key(e, 'e'),
      run: () => ui().openDialog('export'),
    },
    {
      id: 'save',
      group: 'General',
      keys: [MOD, 'S'],
      description: 'Save as .galbe file',
      match: (e) => mod(e) && key(e, 's'),
      run: actions.saveFile,
    },
    {
      id: 'open',
      group: 'General',
      keys: [MOD, 'O'],
      description: 'Open a .galbe file',
      match: (e) => mod(e) && key(e, 'o'),
      run: actions.openFile,
    },
    {
      id: 'shortcuts',
      group: 'General',
      keys: ['?'],
      description: 'Show shortcuts',
      match: (e) => e.key === '?',
      run: () => ui().openDialog('shortcuts'),
    },
    {
      id: 'undo',
      group: 'Edit',
      keys: [MOD, 'Z'],
      description: 'Undo',
      match: (e) => mod(e) && !e.shiftKey && key(e, 'z'),
      run: undo,
    },
    {
      id: 'redo',
      group: 'Edit',
      keys: [MOD, '⇧', 'Z'],
      description: 'Redo',
      match: (e) => (mod(e) && e.shiftKey && key(e, 'z')) || (!isMac && e.ctrlKey && key(e, 'y')),
      run: redo,
    },
    {
      id: 'duplicate',
      group: 'Edit',
      keys: [MOD, 'D'],
      description: 'Duplicate selection',
      match: (e) => mod(e) && key(e, 'd'),
      run: duplicateSelection,
    },
    {
      id: 'group',
      group: 'Edit',
      keys: [MOD, 'G'],
      description: 'Group selection',
      match: (e) => mod(e) && !e.shiftKey && key(e, 'g'),
      run: groupSelection,
    },
    {
      id: 'ungroup',
      group: 'Edit',
      keys: [MOD, '⇧', 'G'],
      description: 'Ungroup',
      match: (e) => mod(e) && e.shiftKey && key(e, 'g'),
      run: ungroupSelection,
    },
    {
      id: 'delete',
      group: 'Edit',
      keys: ['⌫'],
      description: 'Delete selection',
      match: (e) => plain(e) && (e.key === 'Delete' || e.key === 'Backspace'),
      run: () => {
        if (!deleteSelectedKeys()) deleteSelection();
      },
    },
    {
      id: 'select-all',
      group: 'Edit',
      keys: [MOD, 'A'],
      description: 'Select all layers',
      match: (e) => mod(e) && key(e, 'a'),
      run: () =>
        ui().select(
          useDocumentStore
            .getState()
            .doc.nodes.filter((node) => !node.locked)
            .map((node) => node.id),
        ),
    },
    {
      id: 'deselect',
      group: 'Edit',
      keys: ['Esc'],
      description: 'Deselect',
      match: (e) => e.key === 'Escape',
      run: () => ui().select([]),
    },
    {
      id: 'hide',
      group: 'Edit',
      keys: ['H'],
      description: 'Hide / show selection',
      match: (e) => plain(e) && key(e, 'h'),
      run: toggleSelectionVisibility,
    },
    {
      id: 'move',
      group: 'Viewport',
      keys: ['W'],
      description: 'Move gizmo',
      match: (e) => plain(e) && key(e, 'w'),
      run: () => ui().setGizmo('translate'),
    },
    {
      id: 'rotate',
      group: 'Viewport',
      keys: ['E'],
      description: 'Rotate gizmo',
      match: (e) => plain(e) && key(e, 'e'),
      run: () => ui().setGizmo('rotate'),
    },
    {
      id: 'scale',
      group: 'Viewport',
      keys: ['R'],
      description: 'Scale gizmo',
      match: (e) => plain(e) && key(e, 'r'),
      run: () => ui().setGizmo('scale'),
    },
    {
      id: 'frame',
      group: 'Viewport',
      keys: ['F'],
      description: 'Frame selection (or everything)',
      match: (e) => plain(e) && key(e, 'f'),
      run: frameSelection,
    },
    {
      id: 'left-panel',
      group: 'Panels',
      keys: ['['],
      description: 'Toggle tools & layers',
      match: (e) => plain(e) && e.key === '[',
      run: () => ui().togglePanel('left'),
    },
    {
      id: 'play',
      group: 'Timeline',
      keys: ['Space'],
      description: 'Play / pause',
      match: (e) => plain(e) && !e.shiftKey && e.code === 'Space',
      run: () => playback().toggle(),
    },
    {
      id: 'previous-frame',
      group: 'Timeline',
      keys: [','],
      description: 'Previous frame (⇧ ten frames)',
      match: (e) => !e.metaKey && !e.ctrlKey && (e.key === ',' || e.key === '<'),
      run: () => playback().step(-1),
    },
    {
      id: 'next-frame',
      group: 'Timeline',
      keys: ['.'],
      description: 'Next frame',
      match: (e) => !e.metaKey && !e.ctrlKey && (e.key === '.' || e.key === '>'),
      run: () => playback().step(1),
    },
    {
      id: 'go-start',
      group: 'Timeline',
      keys: ['Home'],
      description: 'Go to start',
      match: (e) => plain(e) && e.key === 'Home',
      run: () => playback().seek(0),
    },
    {
      id: 'go-end',
      group: 'Timeline',
      keys: ['End'],
      description: 'Go to end',
      match: (e) => plain(e) && e.key === 'End',
      run: () => playback().seek(useDocumentStore.getState().doc.animation.duration),
    },
    {
      id: 'auto-key',
      group: 'Timeline',
      keys: ['K'],
      description: 'Auto-key on / off',
      match: (e) => plain(e) && key(e, 'k'),
      run: () => playback().setAutoKey(!playback().autoKey),
    },
    {
      id: 'timeline',
      group: 'Panels',
      keys: ['L'],
      description: 'Toggle timeline',
      match: (e) => plain(e) && key(e, 'l'),
      run: () => playback().toggleTimeline(),
    },
    {
      id: 'right-panel',
      group: 'Panels',
      keys: [']'],
      description: 'Toggle inspector',
      match: (e) => plain(e) && e.key === ']',
      run: () => ui().togglePanel('right'),
    },
  ];
}

const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'color',
  'range',
  'button',
  'submit',
  'reset',
  'file',
]);

/** Text entry has priority over shortcuts; toggles and buttons do not. */
export const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)));

export function installHotkeys(hotkeys: Hotkey[]): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || isEditable(event.target)) return;
    if (useUiStore.getState().dialog && event.key !== 'Escape') return;
    const hotkey = hotkeys.find((candidate) => candidate.match(event));
    if (!hotkey) return;
    event.preventDefault();
    hotkey.run();
  };
  window.addEventListener('keydown', onKeyDown);
  return () => window.removeEventListener('keydown', onKeyDown);
}
