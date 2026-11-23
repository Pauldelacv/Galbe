import { type GalbeDocument, loadDocument } from '@galbe/core';
import { db, type ProjectRecord } from './db.ts';

const LAST_PROJECT_KEY = 'galbe:lastProject';

export type ProjectSummary = Omit<ProjectRecord, 'doc'>;

export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await (await db()).getAllFromIndex('projects', 'updatedAt');
  return records.reverse().map(({ doc: _doc, ...summary }) => summary);
}

export async function saveProject(doc: GalbeDocument, thumbnail?: Blob): Promise<void> {
  const store = await db();
  const existing = await store.get('projects', doc.id);
  const now = new Date().toISOString();
  const thumb = thumbnail ?? existing?.thumbnail;
  await store.put('projects', {
    id: doc.id,
    name: doc.name,
    doc: { ...doc, updatedAt: now },
    createdAt: existing?.createdAt ?? doc.createdAt,
    updatedAt: now,
    ...(thumb ? { thumbnail: thumb } : {}),
  });
}

/** Replaces only the thumbnail of a stored project. */
export async function saveThumbnail(id: string, thumbnail: Blob): Promise<void> {
  const store = await db();
  const transaction = store.transaction('projects', 'readwrite');
  const record = await transaction.store.get(id);
  if (record) await transaction.store.put({ ...record, thumbnail });
  await transaction.done;
}

/** Loads, migrates and validates a stored project. */
export async function loadProject(id: string): Promise<GalbeDocument | undefined> {
  const record = await (await db()).get('projects', id);
  return record ? loadDocument(record.doc) : undefined;
}

export async function projectExists(id: string): Promise<boolean> {
  return (await (await db()).getKey('projects', id)) !== undefined;
}

export async function deleteProject(id: string): Promise<void> {
  await (await db()).delete('projects', id);
  if (getLastProjectId() === id) setLastProjectId(null);
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_PROJECT_KEY, id);
    else localStorage.removeItem(LAST_PROJECT_KEY);
  } catch {
    // Storage unavailable: the studio just opens a fresh project next time.
  }
}
