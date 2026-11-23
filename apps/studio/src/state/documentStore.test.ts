import { createStarterDocument } from '@galbe/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDocumentStore } from './documentStore.ts';

const store = () => useDocumentStore.getState();
const textNode = () => {
  const node = store().doc.nodes[0]!;
  if (node.type !== 'text') throw new Error('expected text');
  return node;
};

describe('document store history', () => {
  beforeEach(() => store().load(createStarterDocument()));

  it('undoes and redoes edits', () => {
    store().update(
      (d) => {
        d.name = 'A';
      },
      { label: 'Rename' },
    );
    store().update(
      (d) => {
        d.name = 'B';
      },
      { label: 'Rename' },
    );
    expect(store().doc.name).toBe('B');
    store().undo();
    expect(store().doc.name).toBe('A');
    store().undo();
    expect(store().doc.name).toBe('Untitled');
    store().redo();
    expect(store().doc.name).toBe('A');
  });

  it('records a transaction as one step', () => {
    store().begin('Drag');
    for (let i = 1; i <= 10; i++)
      store().update((d) => {
        d.nodes[0]!.transform.position[0] = i;
      });
    store().end();
    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().doc.nodes[0]!.transform.position[0]).toBe(0);
  });

  it('coalesces repeated keyed edits', () => {
    for (const text of ['G', 'Ga', 'Gal']) {
      store().update(
        (d) => {
          const node = d.nodes[0]!;
          if (node.type === 'text') node.text = text;
        },
        { coalesce: 'text' },
      );
    }
    expect(textNode().text).toBe('Gal');
    expect(store().past).toHaveLength(1);
  });

  it('keeps the camera out of history', () => {
    store().update((d) => {
      d.name = 'A';
    });
    store().update(
      (d) => {
        d.camera.position = [1, 2, 3];
      },
      { history: false },
    );
    store().undo();
    expect(store().doc.name).toBe('Untitled');
    expect(store().doc.camera.position).toEqual([1, 2, 3]);
  });

  it('ignores no-op updates and clears redo on new edits', () => {
    store().update(() => {});
    expect(store().past).toHaveLength(0);
    store().update((d) => {
      d.name = 'A';
    });
    store().undo();
    store().update((d) => {
      d.name = 'C';
    });
    expect(store().future).toHaveLength(0);
  });
});
