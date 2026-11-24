import { type DBSchema, type IDBPDatabase, openDB } from 'idb';

export interface ProjectRecord {
  id: string;
  name: string;
  /** Raw document JSON (validated and migrated on load). */
  doc: unknown;
  createdAt: string;
  updatedAt: string;
  thumbnail?: Blob;
}

export interface AssetRecord {
  id: string;
  blob: Blob;
  name: string;
  mime: string;
  size: number;
  createdAt: string;
}

/** A material saved to the user's local library, reusable across projects. */
export interface LibraryMaterialRecord {
  id: string;
  name: string;
  /** MaterialSpec JSON (validated when applied). */
  spec: unknown;
  /** Metadata of project assets the spec references (textures, matcaps). */
  assets: unknown[];
  thumbnail?: Blob;
  createdAt: string;
}

/** Downloaded files that can be fetched again (e.g. 2K/4K HDRIs), keyed by name. */
export interface CacheRecord {
  key: string;
  blob: Blob;
  createdAt: string;
}

interface GalbeDB extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { updatedAt: string } };
  assets: { key: string; value: AssetRecord };
  library: { key: string; value: LibraryMaterialRecord };
  cache: { key: string; value: CacheRecord };
}

let database: Promise<IDBPDatabase<GalbeDB>> | null = null;

export function db(): Promise<IDBPDatabase<GalbeDB>> {
  database ??= openDB<GalbeDB>('galbe', 2, {
    upgrade(upgradeDb, oldVersion) {
      if (oldVersion < 1) {
        const projects = upgradeDb.createObjectStore('projects', { keyPath: 'id' });
        projects.createIndex('updatedAt', 'updatedAt');
        upgradeDb.createObjectStore('assets', { keyPath: 'id' });
      }
      if (oldVersion < 2) {
        upgradeDb.createObjectStore('library', { keyPath: 'id' });
        upgradeDb.createObjectStore('cache', { keyPath: 'key' });
      }
    },
  });
  return database;
}
