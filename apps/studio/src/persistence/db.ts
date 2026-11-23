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

interface GalbeDB extends DBSchema {
  projects: { key: string; value: ProjectRecord; indexes: { updatedAt: string } };
  assets: { key: string; value: AssetRecord };
}

let database: Promise<IDBPDatabase<GalbeDB>> | null = null;

export function db(): Promise<IDBPDatabase<GalbeDB>> {
  database ??= openDB<GalbeDB>('galbe', 1, {
    upgrade(upgradeDb) {
      const projects = upgradeDb.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      upgradeDb.createObjectStore('assets', { keyPath: 'id' });
    },
  });
  return database;
}
