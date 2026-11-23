import { reorderNode, type SceneNode } from '@galbe/core';
import { Eye, EyeOff, Folder, Lock, LockOpen, Type } from 'lucide-react';
import { type DragEvent, useMemo, useState } from 'react';
import { renameNode } from '../../state/actions.ts';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import styles from './LayerList.module.css';

interface Row {
  node: SceneNode;
  depth: number;
}

/** Newest first, children under their parent. */
function flatten(nodes: readonly SceneNode[]): Row[] {
  const rows: Row[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const node of [...nodes].reverse()) {
      if (node.parentId !== parentId) continue;
      rows.push({ node, depth });
      visit(node.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export function LayerList() {
  const nodes = useDocumentStore((state) => state.doc.nodes);
  const selection = useUiStore((state) => state.selection);
  const select = useUiStore((state) => state.select);
  const rows = useMemo(() => flatten(nodes), [nodes]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const toggle = (id: string, key: 'visible' | 'locked') =>
    documentApi.update(
      (draft) => {
        const node = draft.nodes.find((candidate) => candidate.id === id);
        if (node) node[key] = !node[key];
      },
      { label: key === 'visible' ? 'Toggle visibility' : 'Toggle lock' },
    );

  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    setOver(null);
    const sourceId = dragging;
    setDragging(null);
    if (!sourceId || sourceId === targetId) return;
    documentApi.update(
      (draft) =>
        reorderNode(
          draft,
          sourceId,
          draft.nodes.findIndex((node) => node.id === targetId),
        ),
      { label: 'Reorder' },
    );
  };

  if (!rows.length) {
    return <p className={styles.empty}>No layers yet. Press T to add text.</p>;
  }

  return (
    <ul className={styles.list} aria-label="Layers" data-testid="layers">
      {rows.map(({ node, depth }) => {
        const selected = selection.includes(node.id);
        return (
          <li
            key={node.id}
            className={styles.row}
            data-selected={selected || undefined}
            data-hidden={!node.visible || undefined}
            data-over={over === node.id || undefined}
            style={{ paddingLeft: 8 + depth * 14 }}
            draggable={renaming !== node.id}
            onDragStart={(event) => {
              setDragging(node.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('application/x-galbe-layer', node.id);
            }}
            onDragOver={(event) => {
              if (!dragging) return;
              event.preventDefault();
              setOver(node.id);
            }}
            onDragLeave={() => setOver((current) => (current === node.id ? null : current))}
            onDrop={(event) => onDrop(event, node.id)}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onClick={(event) =>
              select(
                [node.id],
                event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace',
              )
            }
            onDoubleClick={() => setRenaming(node.id)}
          >
            <span className={styles.icon} aria-hidden>
              {node.type === 'text' ? <Type /> : <Folder />}
            </span>
            {renaming === node.id ? (
              <input
                className={styles.rename}
                defaultValue={node.name}
                aria-label="Layer name"
                ref={(element) => {
                  element?.focus();
                  element?.select();
                }}
                onBlur={(event) => {
                  renameNode(node.id, event.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Enter') event.currentTarget.blur();
                  if (event.key === 'Escape') setRenaming(null);
                }}
                onClick={(event) => event.stopPropagation()}
              />
            ) : (
              <span className={styles.name}>{node.name}</span>
            )}
            <button
              type="button"
              className={styles.action}
              data-on={node.locked || undefined}
              aria-label={node.locked ? 'Unlock' : 'Lock'}
              title={node.locked ? 'Unlock' : 'Lock'}
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id, 'locked');
              }}
            >
              {node.locked ? <Lock /> : <LockOpen />}
            </button>
            <button
              type="button"
              className={styles.action}
              data-on={!node.visible || undefined}
              aria-label={node.visible ? 'Hide' : 'Show'}
              title={node.visible ? 'Hide (H)' : 'Show (H)'}
              onClick={(event) => {
                event.stopPropagation();
                toggle(node.id, 'visible');
              }}
            >
              {node.visible ? <Eye /> : <EyeOff />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
