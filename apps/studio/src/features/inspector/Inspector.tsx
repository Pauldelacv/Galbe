import { isMeshNode, type SceneNode } from '@galbe/core';
import { useEffect, useMemo, useState } from 'react';
import { renameNode } from '../../state/actions.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Segmented } from '../../ui/controls.tsx';
import { SceneInspector } from '../environment/SceneInspector.tsx';
import { MaterialSection } from '../materials/MaterialSection.tsx';
import { TextInspector } from '../type/TextInspector.tsx';
import styles from './Inspector.module.css';
import { TransformSection } from './TransformSection.tsx';

export function Inspector() {
  const selection = useUiStore((state) => state.selection);
  const nodes = useDocumentStore((state) => state.doc.nodes);
  const selected = useMemo(
    () => nodes.filter((node) => selection.includes(node.id)),
    [nodes, selection],
  );
  const [tab, setTab] = useState<'layer' | 'scene'>('layer');
  const hasSelection = selected.length > 0;

  useEffect(() => {
    if (hasSelection) setTab('layer');
  }, [hasSelection]);

  const showScene = !hasSelection || tab === 'scene';
  return (
    <aside className={styles.inspector} aria-label="Inspector" data-testid="inspector">
      <div className={styles.tabs}>
        <Segmented
          label="Inspector tab"
          value={showScene ? 'scene' : 'layer'}
          onChange={setTab}
          options={[
            {
              value: 'layer',
              label: hasSelection
                ? selected.length === 1
                  ? 'Layer'
                  : `${selected.length} layers`
                : 'Layer',
              title: hasSelection ? 'Selected layer' : 'Select a layer to edit it',
            },
            { value: 'scene', label: 'Scene' },
          ]}
        />
      </div>
      <div className={styles.scroll}>
        {showScene ? <SceneInspector /> : <NodeInspector nodes={selected} />}
      </div>
    </aside>
  );
}

function NodeInspector({ nodes }: { nodes: SceneNode[] }) {
  const meshes = nodes.filter(isMeshNode);
  const node = nodes.length === 1 ? nodes[0]! : null;
  return (
    <>
      {node && (
        <div className={styles.header}>
          <input
            key={node.id}
            className={styles.name}
            defaultValue={node.name}
            aria-label="Layer name"
            onBlur={(event) => renameNode(node.id, event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </div>
      )}
      {node?.type === 'text' && <TextInspector node={node} />}
      {meshes.length > 0 && <MaterialSection nodes={meshes} />}
      {node && <TransformSection node={node} />}
    </>
  );
}
