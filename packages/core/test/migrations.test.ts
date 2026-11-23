import { describe, expect, it } from 'vitest';
import {
  createStarterDocument,
  GalbeDocumentError,
  loadDocument,
  type Migration,
  safeLoadDocument,
} from '../src/index.ts';

describe('loadDocument', () => {
  it('round-trips a current document through JSON', () => {
    const doc = createStarterDocument();
    expect(loadDocument(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it('rejects non-documents', () => {
    expect(() => loadDocument(null)).toThrow(GalbeDocumentError);
    expect(() => loadDocument([])).toThrow(/expected a JSON object/);
    expect(() => loadDocument({ name: 'x' })).toThrow(/schemaVersion/);
  });

  it('refuses documents from a newer schema', () => {
    const doc = { ...createStarterDocument(), schemaVersion: 99 };
    expect(() => loadDocument(doc)).toThrow(/newer version of Galbe/);
  });

  it('applies registered migrations in order', () => {
    // Simulate a future v3 schema where v1 → v2 renamed `title` to `name`,
    // and v2 → v3 added a field. The final validation targets version 1 here, so we
    // only exercise the migration chain with `targetVersion`.
    const calls: number[] = [];
    const migrations: Record<number, Migration> = {
      1: (raw) => {
        calls.push(1);
        const { title, ...rest } = raw;
        return { ...rest, name: title };
      },
      2: (raw) => {
        calls.push(2);
        return { ...raw, extra: true };
      },
    };
    const result = safeLoadDocument(
      { schemaVersion: 1, title: 'Old' },
      { migrations, targetVersion: 3 },
    );
    expect(calls).toEqual([1, 2]);
    // Validation fails (target schema is fictional) but the chain ran.
    expect(result.ok).toBe(false);
  });

  it('reports a missing migration step', () => {
    expect(() => loadDocument({ schemaVersion: 1 }, { migrations: {}, targetVersion: 2 })).toThrow(
      /No migration registered from schema v1 to v2/,
    );
  });

  it('fills defaults for fields added after a document was saved', () => {
    const doc = createStarterDocument();
    const raw = JSON.parse(JSON.stringify(doc));
    delete raw.ground;
    delete raw.render;
    delete raw.nodes[0].deform;
    const loaded = loadDocument(raw);
    expect(loaded.render.toneMapping).toBe('neutral');
    expect(loaded.ground.contactShadow.enabled).toBe(true);
    const node = loaded.nodes[0]!;
    expect(node.type === 'text' && node.deform.bend.enabled).toBe(false);
  });

  it('formats validation issues with paths', () => {
    const raw = JSON.parse(JSON.stringify(createStarterDocument()));
    raw.nodes[0].depth = 'deep';
    const result = safeLoadDocument(raw);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.issues.some((issue) => issue.startsWith('nodes.0.depth'))).toBe(true);
  });
});
