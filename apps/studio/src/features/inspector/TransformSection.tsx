import type { SceneNode } from '@galbe/core';
import { RotateCcw } from 'lucide-react';
import { IconButton } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updateNode } from './edit.ts';
import { NumberField, VectorField } from './fields.tsx';

export function TransformSection({ node }: { node: SceneNode }) {
  const { position, rotation, scale } = node.transform;
  const uniform = scale[0] === scale[1] && scale[1] === scale[2];
  return (
    <Section
      id="transform"
      title="Transform"
      actions={
        <IconButton
          label="Reset transform"
          size="sm"
          onClick={() =>
            updateNode(node.id, 'Reset transform', (draft) => {
              draft.transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
            })
          }
        >
          <RotateCcw />
        </IconButton>
      }
    >
      <VectorField
        label="Position"
        value={position}
        defaultValue={0}
        dragStep={0.01}
        onChange={(value) =>
          updateNode(node.id, 'Move', (draft) => {
            draft.transform.position = value;
          })
        }
      />
      <VectorField
        label="Rotation"
        value={rotation}
        unit="°"
        step={1}
        precision={1}
        defaultValue={0}
        dragStep={0.5}
        onChange={(value) =>
          updateNode(node.id, 'Rotate', (draft) => {
            draft.transform.rotation = value;
          })
        }
      />
      {uniform ? (
        <NumberField
          label="Scale"
          value={scale[0]}
          min={0.001}
          softMin={0}
          softMax={4}
          step={0.01}
          defaultValue={1}
          onChange={(value) =>
            updateNode(node.id, 'Scale', (draft) => {
              draft.transform.scale = [value, value, value];
            })
          }
        />
      ) : (
        <VectorField
          label="Scale"
          value={scale}
          defaultValue={1}
          dragStep={0.01}
          onChange={(value) =>
            updateNode(node.id, 'Scale', (draft) => {
              draft.transform.scale = value;
            })
          }
        />
      )}
    </Section>
  );
}
