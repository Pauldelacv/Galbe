import { createMaterial, type ShapeNode } from '@galbe/core';
import { Eye, EyeOff, Layers } from 'lucide-react';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updateShape } from '../inspector/edit.ts';
import { NumberField } from '../inspector/fields.tsx';
import { DeformSection, ExtrusionSection } from '../type/TextInspector.tsx';
import styles from './ShapeInspector.module.css';

export function ShapeInspector({ node }: { node: ShapeNode }) {
  return (
    <>
      <ShapeSection node={node} />
      <PathsSection node={node} />
      <ExtrusionSection node={node} />
      <DeformSection node={node} />
    </>
  );
}

function ShapeSection({ node }: { node: ShapeNode }) {
  return (
    <Section id="shape" title="Shape">
      <NumberField
        label="Size"
        value={node.size}
        min={0.01}
        max={100}
        softMax={10}
        step={0.01}
        defaultValue={2}
        title="Longest side of the artwork, in scene units"
        onChange={(value) =>
          updateShape(node.id, 'Shape size', (draft) => {
            draft.size = value;
          })
        }
      />
      <NumberField
        label="Layer gap"
        value={node.layerSpacing}
        min={0}
        max={1}
        softMax={0.2}
        step={0.001}
        precision={3}
        defaultValue={0.004}
        title="Distance between stacked paths (pull them apart for a layered look)"
        onChange={(value) =>
          updateShape(node.id, 'Layer gap', (draft) => {
            draft.layerSpacing = value;
          })
        }
      />
    </Section>
  );
}

function PathsSection({ node }: { node: ShapeNode }) {
  const materials = useDocumentStore((state) => state.doc.materials);
  const activePath = useUiStore((state) => state.activePath);
  const setActivePath = useUiStore((state) => state.setActivePath);
  const active = node.paths.find((path) => path.id === activePath);

  const unify = () => {
    const source = materials[active?.materialId ?? node.materialId];
    documentApi.update(
      (draft) => {
        const target = draft.nodes.find((candidate) => candidate.id === node.id);
        if (target?.type !== 'shape' || !source) return;
        draft.materials[target.materialId] = { ...source, id: target.materialId };
        for (const path of target.paths) delete path.materialId;
      },
      { label: 'One material for all paths' },
    );
    setActivePath(null);
  };

  const splitByColour = () => {
    documentApi.update(
      (draft) => {
        const target = draft.nodes.find((candidate) => candidate.id === node.id);
        if (target?.type !== 'shape') return;
        const base = draft.materials[target.materialId];
        const byColour = new Map<string, string>();
        for (const path of target.paths) {
          let id = byColour.get(path.sourceColor);
          if (!id) {
            const material =
              base?.type === 'physical'
                ? { ...structuredClone(base), id: createMaterial().id, color: path.sourceColor }
                : createMaterial('glossy-plastic', { color: path.sourceColor });
            draft.materials[material.id] = material;
            id = material.id;
            byColour.set(path.sourceColor, id);
          }
          path.materialId = id;
        }
      },
      { label: 'Material per colour' },
    );
  };

  const shared = node.paths.every((path) => !path.materialId);
  return (
    <Section
      id="paths"
      title={`Paths (${node.paths.length})`}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<Layers />}
          onClick={shared ? splitByColour : unify}
          title={
            shared
              ? 'Give each source colour its own material'
              : 'Use one material for the whole shape'
          }
        >
          {shared ? 'Per colour' : 'Unify'}
        </Button>
      }
    >
      <p className={styles.hint}>
        {active
          ? 'Editing this path’s material below.'
          : 'Select a path to edit its material, or edit all of them at once.'}
      </p>
      <ul className={styles.paths} aria-label="Paths" data-testid="shape-paths">
        {node.paths.map((path) => {
          const material = materials[path.materialId ?? node.materialId];
          return (
            <li key={path.id}>
              <button
                type="button"
                className={styles.path}
                data-active={path.id === activePath || undefined}
                data-hidden={!path.visible || undefined}
                onClick={() => setActivePath(path.id === activePath ? null : path.id)}
              >
                <span
                  className={styles.swatch}
                  style={{ background: material?.color ?? path.sourceColor }}
                />
                <span className={styles.name}>{path.name}</span>
                {path.stroke && <span className={styles.badge}>stroke</span>}
                <span
                  role="button"
                  tabIndex={0}
                  className={styles.eye}
                  title={path.visible ? 'Hide path' : 'Show path'}
                  onClick={(event) => {
                    event.stopPropagation();
                    updateShape(node.id, 'Toggle path', (draft) => {
                      const target = draft.paths.find((candidate) => candidate.id === path.id);
                      if (target) target.visible = !target.visible;
                    });
                  }}
                  onKeyDown={() => {}}
                >
                  {path.visible ? <Eye /> : <EyeOff />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {active && (
        <NumberField
          label="Path depth"
          value={active.depthScale}
          min={0}
          max={20}
          softMax={4}
          step={0.05}
          defaultValue={1}
          title="Extrusion of this path relative to the shape depth"
          onChange={(value) =>
            updateShape(node.id, 'Path depth', (draft) => {
              const target = draft.paths.find((candidate) => candidate.id === active.id);
              if (target) target.depthScale = value;
            })
          }
        />
      )}
    </Section>
  );
}
