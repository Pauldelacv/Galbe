import { type GroupNode, isMeshNode, type SceneNode } from '@galbe/core';
import { Group, Ungroup } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { renameNode } from '../../state/actions.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { groupSelection, ungroupSelection } from '../../state/objectActions.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, Segmented } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { CoverInspector } from '../cover/CoverInspector.tsx';
import { EffectsPanel } from '../effects/EffectsPanel.tsx';
import { SceneInspector } from '../environment/SceneInspector.tsx';
import { MaterialSection } from '../materials/MaterialSection.tsx';
import { ModelInspector } from '../models/ModelInspector.tsx';
import { MotionSection } from '../motion/MotionSection.tsx';
import { PrimitiveInspector } from '../primitives/PrimitiveInspector.tsx';
import { ShapeInspector } from '../shapes/ShapeInspector.tsx';
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
  const tab = useUiStore((state) => state.inspectorTab);
  const setTab = useUiStore((state) => state.setInspectorTab);
  const effectCount = useDocumentStore(
    (state) => state.doc.effects.filter((e) => e.enabled).length,
  );
  const hasSelection = selected.length > 0;
  const selectionKey = selection.join(',');

  // biome-ignore lint/correctness/useExhaustiveDependencies: switch tab when the selection changes
  useEffect(() => {
    if (hasSelection) setTab('layer');
  }, [selectionKey]);

  const current = tab === 'layer' && !hasSelection ? 'scene' : tab;
  return (
    <aside className={styles.inspector} aria-label="Inspector" data-testid="inspector">
      <div className={styles.tabs}>
        <Segmented
          label="Inspector tab"
          value={current}
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
            { value: 'cover', label: 'Cover', title: 'Backgrounds, text overlays and guides' },
            {
              value: 'effects',
              label: effectCount ? `Effects · ${effectCount}` : 'Effects',
              title: 'Post-processing stack',
            },
          ]}
        />
      </div>
      <div className={styles.scroll}>
        {current === 'scene' ? (
          <SceneInspector />
        ) : current === 'cover' ? (
          <CoverInspector />
        ) : current === 'effects' ? (
          <EffectsPanel />
        ) : (
          <NodeInspector nodes={selected} />
        )}
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
      {node?.type === 'shape' && <ShapeInspector node={node} />}
      {node?.type === 'primitive' && <PrimitiveInspector node={node} />}
      {node?.type === 'model' && <ModelInspector node={node} />}
      {node?.type === 'group' && <GroupSection node={node} />}
      {nodes.length > 1 && <MultiSection count={nodes.length} />}
      {meshes.length > 0 && <MaterialSection nodes={meshes} />}
      {node && <TransformSection node={node} />}
      {node && <MotionSection node={node} />}
    </>
  );
}

function GroupSection({ node }: { node: GroupNode }) {
  const children = useDocumentStore(
    (state) => state.doc.nodes.filter((candidate) => candidate.parentId === node.id).length,
  );
  return (
    <Section id="group" title="Group">
      <p className={styles.note}>
        {children} layer{children === 1 ? '' : 's'}. Move, rotate or scale the group to transform
        them together. Drag layers onto it in the layer list.
      </p>
      <Button size="sm" icon={<Ungroup />} onClick={ungroupSelection}>
        Ungroup
      </Button>
    </Section>
  );
}

function MultiSection({ count }: { count: number }) {
  return (
    <Section id="multi" title={`${count} layers`}>
      <p className={styles.note}>
        The gizmo moves, rotates and scales the selection around its centre. Material edits apply to
        every selected layer.
      </p>
      <Button size="sm" icon={<Group />} onClick={groupSelection}>
        Group
      </Button>
    </Section>
  );
}
