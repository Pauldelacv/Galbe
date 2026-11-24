import { findNode, isAncestorOrSelf, type SceneNode } from '@galbe/core';
import { Box, Circle, Eye, EyeOff, Folder, Lock, LockOpen, Shapes, Type } from 'lucide-react';
import { type DragEvent, useMemo, useState } from 'react';
import { renameNode } from '../../state/actions.ts';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { moveLayer } from '../../state/objectActions.ts';
import { useUiStore } from '../../state/uiStore.ts';
import styles from './LayerList.module.css';

const ICONS: Record<SceneNode['type'], typeof Type> = {
  text: Type,
  group: Folder,
  shape: Shapes,
  primitive: Circle,
  model: Box,
};

type DropPosition = 'above' | 'below' | 'inside';

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
  const [over, setOver] = useState<{ id: string; position: DropPosition } | null>(null);

  const toggle = (id: string, key: 'visible' | 'locked') =>
    documentApi.update(
      (draft) => {
        const node = draft.nodes.find((candidate) => candidate.id === id);
        if (node) node[key] = !node[key];
      },
      { label: key === 'visible' ? 'Toggle visibility' : 'Toggle lock' },
    );

  const positionOf = (event: DragEvent, node: SceneNode): DropPosition => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    if (node.type === 'group' && y > 0.25 && y < 0.75) return 'inside';
    return y < 0.5 ? 'above' : 'below';
  };

  const onDrop = (event: DragEvent, target: SceneNode) => {
    event.preventDefault();
    const position = over?.id === target.id ? over.position : 'above';
    setOver(null);
    const sourceId = dragging;
    setDragging(null);
    const doc = documentApi.get();
    if (!sourceId || sourceId === target.id || !findNode(doc, sourceId)) return;
    if (isAncestorOrSelf(doc, sourceId, target.id)) return; // no dropping into itself
    if (position === 'inside') return moveLayer(sourceId, target.id);
    // The list shows the top of the stack first: "above" = later in the document.
    const index = doc.nodes.findIndex((node) => node.id === target.id);
    moveLayer(sourceId, target.parentId, position === 'above' ? index + 1 : index);
  };

  if (!rows.length) {
    return (
      <p className={styles.empty}>
        No layers yet. Press T to add text, or drop an SVG or a 3D model.
      </p>
    );
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
            data-over={over?.id === node.id ? over.position : undefined}
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
              const position = positionOf(event, node);
              if (over?.id !== node.id || over.position !== position)
                setOver({ id: node.id, position });
            }}
            onDragLeave={() => setOver((current) => (current?.id === node.id ? null : current))}
            onDrop={(event) => onDrop(event, node)}
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
              {(() => {
                const Icon = ICONS[node.type];
                return <Icon />;
              })()}
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
