import { createStarterDocument, type GalbeDocument } from '@galbe/core';
import { controller, viewport } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { useUiStore } from '../state/uiStore.ts';
import {
  getLastProjectId,
  loadProject,
  saveProject,
  saveThumbnail,
  setLastProjectId,
} from './projectStore.ts';
import { renderThumbnail } from './thumbnail.ts';

const SAVE_DELAY_MS = 400;
const THUMBNAIL_INTERVAL_MS = 15_000;

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let savedRevision = -1;
let lastThumbnailAt = 0;
let saving: Promise<void> = Promise.resolve();
/** Projects that got a thumbnail during this session. */
const thumbnailed = new Set<string>();
let thumbnailTimer: ReturnType<typeof setTimeout> | undefined;

/** Opens the last project, or starts a fresh one. */
export async function initSession(): Promise<void> {
  const lastId = getLastProjectId();
  let doc: GalbeDocument | undefined;
  if (lastId) {
    try {
      doc = await loadProject(lastId);
    } catch (error) {
      console.warn('[galbe] could not reopen the last project', error);
    }
  }
  await openDocument(doc ?? createStarterDocument(), { save: !doc });
}

/** Replaces the open project (saving the current one first). */
export async function openDocument(doc: GalbeDocument, { save = false } = {}): Promise<void> {
  await flushSave();
  useUiStore.getState().select([]);
  useDocumentStore.getState().load(doc);
  savedRevision = useDocumentStore.getState().revision;
  setLastProjectId(doc.id);
  if (save) await saveNow();
  scheduleThumbnail();
}

/** Refreshes the project thumbnail once the viewport has rendered the opened project. */
function scheduleThumbnail(delay = 1500): void {
  clearTimeout(thumbnailTimer);
  thumbnailTimer = setTimeout(async () => {
    if (!viewport.gl) return scheduleThumbnail(1000);
    await controller.whenReady();
    await saveNow({ thumbnail: true });
  }, delay);
}

export async function saveNow({ thumbnail = false } = {}): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { doc, revision } = useDocumentStore.getState();
  const setState = (saveState: ReturnType<typeof useUiStore.getState>['saveState']) =>
    useUiStore.setState({ saveState });
  saving = saving.then(async () => {
    setState({ status: 'saving' });
    try {
      // The document is written first so a slow thumbnail never delays (or loses) the save.
      await saveProject(doc);
      savedRevision = revision;
      setState({ status: 'saved', at: Date.now() });
    } catch (error) {
      console.error('[galbe] save failed', error);
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const wantsThumbnail =
      thumbnail || !thumbnailed.has(doc.id) || Date.now() - lastThumbnailAt > THUMBNAIL_INTERVAL_MS;
    if (wantsThumbnail) void updateThumbnail(doc.id);
  });
  return saving;
}

export async function flushSave(): Promise<void> {
  if (saveTimer !== undefined || useDocumentStore.getState().revision !== savedRevision)
    await saveNow();
  await saving;
}

let thumbnailing: Promise<void> = Promise.resolve();

/** Renders and stores a thumbnail in the background (never blocks saving). */
function updateThumbnail(id: string): Promise<void> {
  thumbnailing = thumbnailing.then(async () => {
    if (useUiStore.getState().interacting > 0 || useDocumentStore.getState().doc.id !== id) return;
    const thumb = await renderThumbnail();
    if (!thumb) return;
    lastThumbnailAt = Date.now();
    thumbnailed.add(id);
    await saveThumbnail(id, thumb).catch((error: unknown) =>
      console.warn('[galbe] thumbnail not saved', error),
    );
  });
  return thumbnailing;
}

/** Debounced autosave on every document change; flushes when the page is hidden. */
export function startAutosave(): () => void {
  const unsubscribe = useDocumentStore.subscribe((state, previous) => {
    if (state.revision === previous.revision || state.revision === savedRevision) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onHide);
  return () => {
    unsubscribe();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onHide);
  };
}
