import { PRIMITIVE_KINDS, type PrimitiveKind, type PrimitiveNode } from '@galbe/core';
import { Dices } from 'lucide-react';
import { primitiveName } from '../../state/objectActions.ts';
import { Button, Field, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updatePrimitive } from '../inspector/edit.ts';
import { NumberField, VectorField } from '../inspector/fields.tsx';

/** Which params each kind uses. */
const USES: Record<PrimitiveKind, readonly string[]> = {
  sphere: ['radius', 'arc'],
  roundedBox: ['size', 'cornerRadius'],
  torus: ['radius', 'tube', 'arc'],
  capsule: ['radius', 'height'],
  cylinder: ['radius', 'height', 'taper', 'arc'],
  cone: ['radius', 'height', 'arc'],
  ring: ['radius', 'innerRatio', 'height', 'bevel'],
  blob: ['radius', 'noise'],
};

export function PrimitiveInspector({ node }: { node: PrimitiveNode }) {
  const p = node.params;
  const uses = new Set(USES[node.kind]);
  const set = (label: string, recipe: (params: PrimitiveNode['params']) => void) =>
    updatePrimitive(node.id, label, (draft) => recipe(draft.params));
  return (
    <Section id="primitive" title="Primitive">
      <Field label="Kind">
        <Select
          label="Primitive kind"
          value={node.kind}
          onChange={(event) =>
            updatePrimitive(node.id, 'Primitive kind', (draft) => {
              const kind = event.target.value as PrimitiveKind;
              if (draft.name === primitiveName(draft.kind)) draft.name = primitiveName(kind);
              draft.kind = kind;
            })
          }
        >
          {PRIMITIVE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {primitiveName(kind)}
            </option>
          ))}
        </Select>
      </Field>
      {uses.has('radius') && (
        <NumberField
          label={node.kind === 'ring' ? 'Outer radius' : 'Radius'}
          value={p.radius}
          min={0.01}
          max={100}
          softMax={4}
          defaultValue={0.75}
          onChange={(value) =>
            set('Radius', (params) => {
              params.radius = value;
            })
          }
        />
      )}
      {uses.has('size') && (
        <VectorField
          label="Size"
          value={p.size}
          step={0.01}
          onChange={(value) =>
            set('Size', (params) => {
              params.size = value.map((v) => Math.max(0.01, v)) as [number, number, number];
            })
          }
        />
      )}
      {uses.has('cornerRadius') && (
        <NumberField
          label="Corners"
          value={p.cornerRadius}
          min={0}
          max={50}
          softMax={1}
          defaultValue={0.15}
          onChange={(value) =>
            set('Corner radius', (params) => {
              params.cornerRadius = value;
            })
          }
        />
      )}
      {uses.has('tube') && (
        <NumberField
          label="Tube"
          value={p.tube}
          min={0.005}
          max={50}
          softMax={1}
          defaultValue={0.25}
          onChange={(value) =>
            set('Tube', (params) => {
              params.tube = value;
            })
          }
        />
      )}
      {uses.has('innerRatio') && (
        <NumberField
          label="Hole"
          value={p.innerRatio}
          min={0}
          max={0.99}
          defaultValue={0.6}
          title="Inner radius as a fraction of the outer radius"
          onChange={(value) =>
            set('Hole', (params) => {
              params.innerRatio = value;
            })
          }
        />
      )}
      {uses.has('height') && (
        <NumberField
          label={node.kind === 'ring' ? 'Thickness' : 'Height'}
          value={p.height}
          min={0.01}
          max={100}
          softMax={4}
          defaultValue={1.2}
          onChange={(value) =>
            set('Height', (params) => {
              params.height = value;
            })
          }
        />
      )}
      {uses.has('taper') && (
        <NumberField
          label="Taper"
          value={p.taper}
          min={0}
          max={4}
          softMax={2}
          defaultValue={1}
          title="Top radius relative to the bottom"
          onChange={(value) =>
            set('Taper', (params) => {
              params.taper = value;
            })
          }
        />
      )}
      {uses.has('bevel') && (
        <NumberField
          label="Bevel"
          value={p.bevel}
          min={0}
          max={1}
          softMax={0.2}
          defaultValue={0.04}
          onChange={(value) =>
            set('Bevel', (params) => {
              params.bevel = value;
            })
          }
        />
      )}
      {uses.has('arc') && (
        <NumberField
          label="Arc"
          value={p.arc}
          min={1}
          max={360}
          step={1}
          precision={0}
          unit="°"
          defaultValue={360}
          onChange={(value) =>
            set('Arc', (params) => {
              params.arc = value;
            })
          }
        />
      )}
      {uses.has('noise') && (
        <>
          <NumberField
            label="Noise"
            value={p.noise.amplitude}
            min={0}
            max={2}
            softMax={0.8}
            defaultValue={0.25}
            onChange={(value) =>
              set('Noise amount', (params) => {
                params.noise.amplitude = value;
              })
            }
          />
          <NumberField
            label="Scale"
            value={p.noise.frequency}
            min={0.01}
            max={10}
            softMax={4}
            defaultValue={1.4}
            onChange={(value) =>
              set('Noise scale', (params) => {
                params.noise.frequency = value;
              })
            }
          />
          <NumberField
            label="Octaves"
            value={p.noise.octaves}
            min={1}
            max={5}
            step={1}
            precision={0}
            defaultValue={2}
            onChange={(value) =>
              set('Noise octaves', (params) => {
                params.noise.octaves = Math.round(value);
              })
            }
          />
          <Field label="Seed">
            <Button
              size="sm"
              icon={<Dices />}
              onClick={() =>
                set('New seed', (params) => {
                  params.noise.seed = (params.noise.seed * 48271 + 11) % 1_000_000;
                })
              }
            >
              Shuffle ({p.noise.seed})
            </Button>
          </Field>
        </>
      )}
      <NumberField
        label="Detail"
        value={p.detail}
        min={1}
        max={4}
        step={1}
        precision={0}
        defaultValue={2}
        title="Tessellation quality"
        onChange={(value) =>
          set('Detail', (params) => {
            params.detail = Math.round(value);
          })
        }
      />
      <Toggle
        label="Smooth shading"
        checked={node.smooth}
        onChange={(smooth) =>
          updatePrimitive(node.id, 'Smooth shading', (draft) => {
            draft.smooth = smooth;
          })
        }
      />
    </Section>
  );
}
