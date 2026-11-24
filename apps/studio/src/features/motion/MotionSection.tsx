import {
  CAMERA_MOTION_TYPES,
  createMaterial,
  createMotion,
  EASING_LABELS,
  EASING_NAMES,
  type Easing,
  isMeshNode,
  MATERIAL_PRESETS,
  type Motion,
  type MotionType,
  NODE_MOTION_TYPES,
  REVEAL_ORDERS,
  REVEAL_STYLES,
  type SceneNode,
  setKeyframe,
} from '@galbe/core';
import type { Draft } from 'immer';
import { Diamond, Power, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { keyTime, usePlaybackStore } from '../../state/playbackStore.ts';
import { notify } from '../../state/toastStore.ts';
import { Field, IconButton, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { NumberField } from '../inspector/fields.tsx';
import styles from './Motion.module.css';
import { MOTION_HINTS, MOTION_LABELS } from './motionInfo.ts';

function updateMotion(id: string, label: string, recipe: (motion: Draft<Motion>) => void) {
  documentApi.update(
    (draft) => {
      const motion = draft.animation.motions.find((candidate) => candidate.id === id);
      if (motion) recipe(motion);
    },
    { label, coalesce: `motion:${id}:${label}`, animate: false },
  );
}

export function addMotion(type: MotionType, nodeId?: string): void {
  documentApi.update(
    (draft) => {
      const input: Record<string, unknown> = nodeId ? { nodeId } : {};
      if (type === 'materialTransition' && nodeId) {
        // Start with a contrasting preset so the transition is visible straight away.
        const node = draft.nodes.find((candidate) => candidate.id === nodeId);
        const current = node && isMeshNode(node) ? draft.materials[node.materialId] : undefined;
        const presetId =
          current?.type === 'physical' && current.preset === 'gold' ? 'glass-clear' : 'gold';
        const target = createMaterial(
          MATERIAL_PRESETS.some((p) => p.id === presetId) ? presetId : undefined,
        );
        draft.materials[target.id] = target;
        input.toMaterialId = target.id;
      }
      // Entrances read best quick, then hold.
      if (type === 'reveal') input.end = Math.min(draft.animation.duration, 1.5);
      draft.animation.motions.push(createMotion(type, input));
    },
    { label: `Add ${MOTION_LABELS[type].toLowerCase()}`, animate: false },
  );
  usePlaybackStore.setState({ timelineOpen: true });
}

const removeMotion = (id: string) =>
  documentApi.update(
    (draft) => {
      draft.animation.motions = draft.animation.motions.filter((motion) => motion.id !== id);
    },
    { label: 'Remove motion', animate: false },
  );

/** Keys the node's whole transform at the playhead. */
function keyTransform(node: SceneNode): void {
  const time = keyTime();
  documentApi.update(
    (draft) => {
      const { position, rotation, scale } = node.transform;
      const base = `nodes.${node.id}.transform`;
      for (const [field, value] of [
        ['position', position],
        ['rotation', rotation],
        ['scale', scale],
      ] as const)
        value.forEach((v, axis) => {
          setKeyframe(draft.animation, `${base}.${field}.${axis}`, time, v);
        });
    },
    { label: 'Key transform', animate: false },
  );
  usePlaybackStore.setState({ timelineOpen: true });
  notify('Transform keyed at the playhead', 'success');
}

function AddMotion({ types, nodeId }: { types: readonly MotionType[]; nodeId?: string }) {
  return (
    <Select
      label="Add a motion"
      value=""
      data-testid="add-motion"
      onChange={(event) => {
        if (event.target.value) addMotion(event.target.value as MotionType, nodeId);
      }}
    >
      <option value="">Add motion…</option>
      {types.map((type) => (
        <option key={type} value={type} title={MOTION_HINTS[type]}>
          {MOTION_LABELS[type]} — {MOTION_HINTS[type]}
        </option>
      ))}
    </Select>
  );
}

/** Motion presets of a layer (Layer tab). */
export function MotionSection({ node }: { node: SceneNode }) {
  const all = useDocumentStore((state) => state.doc.animation.motions);
  const motions = useMemo(
    () => all.filter((motion) => 'nodeId' in motion && motion.nodeId === node.id),
    [all, node.id],
  );
  const types = NODE_MOTION_TYPES.filter(
    (type) => type !== 'materialTransition' || isMeshNode(node),
  );
  return (
    <Section
      id="motion"
      title="Motion"
      actions={
        <IconButton
          label="Key the transform at the playhead"
          size="sm"
          onClick={() => keyTransform(node)}
        >
          <Diamond />
        </IconButton>
      }
    >
      <AddMotion types={types} nodeId={node.id} />
      {motions.map((motion) => (
        <MotionCard key={motion.id} motion={motion} />
      ))}
    </Section>
  );
}

/** Camera moves (Scene tab). */
export function CameraMotionSection() {
  const all = useDocumentStore((state) => state.doc.animation.motions);
  const motions = useMemo(() => all.filter((motion) => !('nodeId' in motion)), [all]);
  return (
    <Section id="camera-motion" title="Camera motion">
      <AddMotion types={CAMERA_MOTION_TYPES} />
      {motions.map((motion) => (
        <MotionCard key={motion.id} motion={motion} />
      ))}
    </Section>
  );
}

function EasingSelect({ value, onChange }: { value: Easing; onChange: (easing: Easing) => void }) {
  return (
    <Field label="Easing">
      <Select
        label="Easing"
        value={typeof value === 'string' ? value : 'custom'}
        onChange={(event) => onChange(event.target.value as Easing)}
      >
        {typeof value !== 'string' && <option value="custom">Custom curve</option>}
        {EASING_NAMES.map((name) => (
          <option key={name} value={name}>
            {EASING_LABELS[name]}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function MotionCard({ motion }: { motion: Motion }) {
  const duration = useDocumentStore((state) => state.doc.animation.duration);
  const materials = useDocumentStore((state) => state.doc.materials);
  const set = (label: string, recipe: (draft: Draft<Motion>) => void) =>
    updateMotion(motion.id, label, recipe);
  const number = (
    label: string,
    key: string,
    props: {
      min: number;
      max: number;
      softMin?: number;
      softMax?: number;
      step?: number;
      precision?: number;
      unit?: string;
    },
  ) => (
    <NumberField
      label={label}
      value={(motion as unknown as Record<string, number>)[key]!}
      {...props}
      onChange={(value) =>
        set(label, (draft) => {
          (draft as unknown as Record<string, number>)[key] =
            props.precision === 0 ? Math.round(value) : value;
        })
      }
    />
  );
  const end = motion.end ?? duration;
  return (
    <div
      className={styles.card}
      data-disabled={!motion.enabled || undefined}
      data-testid={`motion-${motion.type}`}
    >
      <div className={styles.cardHeader}>
        <strong title={MOTION_HINTS[motion.type]}>{MOTION_LABELS[motion.type]}</strong>
        <IconButton
          label={motion.enabled ? 'Disable' : 'Enable'}
          size="sm"
          active={motion.enabled}
          onClick={() =>
            set('Toggle motion', (draft) => {
              draft.enabled = !draft.enabled;
            })
          }
        >
          <Power />
        </IconButton>
        <IconButton label="Remove motion" size="sm" onClick={() => removeMotion(motion.id)}>
          <Trash2 />
        </IconButton>
      </div>

      {'axis' in motion && (
        <Field label="Axis">
          <Segmented
            label="Axis"
            value={motion.axis}
            onChange={(axis) =>
              set('Axis', (draft) => {
                if ('axis' in draft) draft.axis = axis;
              })
            }
            options={[
              { value: 'x', label: 'X' },
              { value: 'y', label: 'Y' },
              { value: 'z', label: 'Z' },
            ]}
          />
        </Field>
      )}
      {motion.type === 'spin' &&
        number('Turns', 'turns', {
          min: -100,
          max: 100,
          softMin: -4,
          softMax: 4,
          step: 1,
          precision: 0,
        })}
      {motion.type === 'float' && (
        <>
          {number('Height', 'amplitude', { min: 0, max: 20, softMax: 1 })}
          {number('Cycles', 'cycles', { min: 1, max: 100, softMax: 8, step: 1, precision: 0 })}
          {number('Tilt', 'tilt', { min: 0, max: 90, softMax: 20, unit: '°' })}
        </>
      )}
      {motion.type === 'swing' && (
        <>
          {number('Angle', 'angle', { min: 0, max: 180, softMax: 60, unit: '°' })}
          {number('Cycles', 'cycles', { min: 1, max: 100, softMax: 8, step: 1, precision: 0 })}
        </>
      )}
      {motion.type === 'wave' && (
        <>
          {number('Height', 'amplitude', { min: 0, max: 10, softMax: 1 })}
          {number('Wavelength', 'wavelength', { min: 1, max: 100, softMax: 20, unit: ' letters' })}
          {number('Cycles', 'cycles', { min: 1, max: 100, softMax: 8, step: 1, precision: 0 })}
          {number('Rotate', 'rotate', { min: 0, max: 90, softMax: 45, unit: '°' })}
        </>
      )}
      {motion.type === 'reveal' && (
        <>
          <Field label="Style">
            <Select
              label="Reveal style"
              value={motion.style}
              onChange={(event) =>
                set('Reveal style', (draft) => {
                  if (draft.type === 'reveal')
                    draft.style = event.target.value as typeof motion.style;
                })
              }
            >
              {REVEAL_STYLES.map((style) => (
                <option key={style} value={style}>
                  {style[0]!.toUpperCase() + style.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Order">
            <Select
              label="Reveal order"
              value={motion.order}
              onChange={(event) =>
                set('Reveal order', (draft) => {
                  if (draft.type === 'reveal')
                    draft.order = event.target.value as typeof motion.order;
                })
              }
            >
              {REVEAL_ORDERS.map((order) => (
                <option key={order} value={order}>
                  {order[0]!.toUpperCase() + order.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mode">
            <Segmented
              label="Reveal mode"
              value={motion.mode}
              onChange={(mode) =>
                set('Reveal mode', (draft) => {
                  if (draft.type === 'reveal') draft.mode = mode;
                })
              }
              options={[
                { value: 'in', label: 'In' },
                { value: 'out', label: 'Out' },
                { value: 'inOut', label: 'In & out' },
              ]}
            />
          </Field>
          {number('Stagger', 'stagger', { min: 0, max: 1 })}
          {number('Distance', 'distance', { min: 0, max: 20, softMax: 2 })}
          {motion.order === 'random' &&
            number('Seed', 'seed', { min: 0, max: 1_000_000, softMax: 100, step: 1, precision: 0 })}
        </>
      )}
      {motion.type === 'materialTransition' && (
        <Field label="Into">
          <Select
            label="Target material"
            value={motion.toMaterialId}
            onChange={(event) => {
              const value = event.target.value;
              if (value.startsWith('preset:')) {
                const material = createMaterial(value.slice(7));
                documentApi.update(
                  (draft) => {
                    draft.materials[material.id] = material;
                    const m = draft.animation.motions.find((c) => c.id === motion.id);
                    if (m?.type === 'materialTransition') m.toMaterialId = material.id;
                  },
                  { label: 'Transition material', animate: false },
                );
              } else
                set('Transition material', (draft) => {
                  if (draft.type === 'materialTransition') draft.toMaterialId = value;
                });
            }}
          >
            <optgroup label="In this project">
              {Object.values(materials).map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="New from preset">
              {MATERIAL_PRESETS.map((preset) => (
                <option key={preset.id} value={`preset:${preset.id}`}>
                  {preset.name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
      )}
      {motion.type === 'orbit' &&
        number('Angle', 'angle', { min: -3600, max: 3600, softMin: -360, softMax: 360, unit: '°' })}
      {(motion.type === 'truck' || motion.type === 'dolly') &&
        number('Distance', 'distance', { min: -100, max: 100, softMin: -5, softMax: 5 })}
      {'pingPong' in motion && (
        <Toggle
          label="There and back (loops)"
          checked={motion.pingPong}
          onChange={(pingPong) =>
            set('Ping-pong', (draft) => {
              if ('pingPong' in draft) draft.pingPong = pingPong;
            })
          }
        />
      )}
      {'easing' in motion && (
        <EasingSelect
          value={motion.easing}
          onChange={(easing) =>
            set('Easing', (draft) => {
              if ('easing' in draft) draft.easing = easing;
            })
          }
        />
      )}
      <Field label="Timing">
        <NumberField
          label="From"
          value={motion.start}
          min={0}
          max={Math.max(0, end - 0.01)}
          step={0.05}
          unit="s"
          onChange={(value) =>
            set('Motion start', (draft) => {
              draft.start = value;
            })
          }
        />
        <NumberField
          label="To"
          value={end}
          min={motion.start + 0.01}
          max={duration}
          step={0.05}
          unit="s"
          onChange={(value) =>
            set('Motion end', (draft) => {
              draft.end = value >= duration - 1e-6 ? null : value;
            })
          }
        />
      </Field>
    </div>
  );
}
