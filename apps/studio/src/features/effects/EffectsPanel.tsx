import {
  EFFECT_DEFINITIONS,
  type EffectDefinition,
  type EffectParam,
  type EffectSpec,
  getEffectDefinition,
  resolveEffectParams,
} from '@galbe/core';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  FileUp,
  GripVertical,
  Plus,
  Trash2,
} from 'lucide-react';
import { type DragEvent, useState } from 'react';
import { pickFiles } from '../../lib/files.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { addEffect, moveEffect, removeEffect, updateEffect } from '../../state/objectActions.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Field, IconButton, Select, Toggle } from '../../ui/controls.tsx';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import { importLutFile } from '../objects/importObjects.ts';
import styles from './EffectsPanel.module.css';

const STAGE_HINT =
  'Bloom and depth of field run on the raw HDR image, before tone mapping; the other effects run after it, in the order shown.';

export function EffectsPanel() {
  const effects = useDocumentStore((state) => state.doc.effects);
  const assets = useDocumentStore((state) => state.doc.assets);
  const expanded = useUiStore((state) => state.expandedEffect);
  const setExpanded = useUiStore((state) => state.setExpandedEffect);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    setOver(null);
    if (!dragging || dragging === targetId) return;
    moveEffect(
      dragging,
      effects.findIndex((effect) => effect.id === targetId),
    );
    setDragging(null);
  };

  return (
    <div className={styles.panel} data-testid="effects-panel">
      <div className={styles.add}>
        <Select
          label="Add effect"
          value=""
          data-testid="add-effect"
          onChange={(event) => {
            if (event.target.value) addEffect(event.target.value);
          }}
        >
          <option value="">Add an effect…</option>
          <optgroup label="Light (before tone mapping)">
            {EFFECT_DEFINITIONS.filter((d) => d.stage === 'hdr').map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </optgroup>
          <optgroup label="Look (after tone mapping)">
            {EFFECT_DEFINITIONS.filter((d) => d.stage === 'display').map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </optgroup>
        </Select>
      </div>

      {!effects.length && (
        <div className={styles.empty}>
          <Plus />
          <p>
            No effects yet. Add bloom for glowing materials, film grain, a halftone or a colour
            grade. Effects show in the viewport and in every export.
          </p>
        </div>
      )}

      <ol className={styles.list}>
        {effects.map((effect, index) => {
          const definition = getEffectDefinition(effect.type);
          const open = expanded === effect.id;
          return (
            <li
              key={effect.id}
              className={styles.item}
              data-disabled={!effect.enabled || undefined}
              data-over={over === effect.id || undefined}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setOver(effect.id);
              }}
              onDragLeave={() => setOver((current) => (current === effect.id ? null : current))}
              onDrop={(event) => onDrop(event, effect.id)}
              data-testid={`effect-${effect.type}`}
            >
              <div className={styles.header}>
                <span
                  className={styles.grip}
                  draggable
                  onDragStart={(event) => {
                    setDragging(effect.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('application/x-galbe-effect', effect.id);
                  }}
                  onDragEnd={() => {
                    setDragging(null);
                    setOver(null);
                  }}
                  title="Drag to reorder"
                >
                  <GripVertical />
                </span>
                <button
                  type="button"
                  className={styles.title}
                  onClick={() => setExpanded(open ? null : effect.id)}
                  aria-expanded={open}
                >
                  {definition?.label ?? effect.type}
                  {definition?.stage === 'hdr' && <span className={styles.stage}>HDR</span>}
                </button>
                <IconButton
                  size="sm"
                  label="Move up"
                  disabled={index === 0}
                  onClick={() => moveEffect(effect.id, index - 1)}
                >
                  <ChevronUp />
                </IconButton>
                <IconButton
                  size="sm"
                  label="Move down"
                  disabled={index === effects.length - 1}
                  onClick={() => moveEffect(effect.id, index + 1)}
                >
                  <ChevronDown />
                </IconButton>
                <IconButton
                  size="sm"
                  label={effect.enabled ? 'Disable' : 'Enable'}
                  onClick={() =>
                    updateEffect(effect.id, 'Toggle effect', (draft) => {
                      draft.enabled = !draft.enabled;
                    })
                  }
                >
                  {effect.enabled ? <Eye /> : <EyeOff />}
                </IconButton>
                <IconButton size="sm" label="Remove" onClick={() => removeEffect(effect.id)}>
                  <Trash2 />
                </IconButton>
              </div>
              {open && definition && (
                <EffectParams effect={effect} definition={definition} assets={assets} />
              )}
              {open && !definition && (
                <p className={styles.hint}>This effect comes from a newer Galbe or a plugin.</p>
              )}
            </li>
          );
        })}
      </ol>
      {effects.length > 1 && <p className={styles.hint}>{STAGE_HINT}</p>}
    </div>
  );
}

function EffectParams({
  effect,
  definition,
  assets,
}: {
  effect: EffectSpec;
  definition: EffectDefinition;
  assets: ReturnType<typeof useDocumentStore.getState>['doc']['assets'];
}) {
  const params = resolveEffectParams(effect);
  const setParam = (key: string, label: string, value: number | boolean | string) =>
    updateEffect(effect.id, `${definition.label}: ${label}`, (draft) => {
      draft.params[key] = value;
    });
  return (
    <div className={styles.params}>
      <p className={styles.hint}>{definition.description}</p>
      {Object.entries(definition.params).map(([key, param]) => {
        const visible = definition.showIf?.[key]?.(params) ?? true;
        if (!visible) return null;
        return (
          <ParamControl
            key={key}
            param={param}
            value={params[key]!}
            assets={assets}
            onChange={(value) => setParam(key, param.label, value)}
            onImport={
              param.kind === 'asset'
                ? async () => {
                    const [file] = await pickFiles(param.accept);
                    if (!file) return;
                    try {
                      await importLutFile(file, effect.id);
                    } catch (error) {
                      notify(error instanceof Error ? error.message : 'Invalid LUT file.', 'error');
                    }
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

function ParamControl({
  param,
  value,
  assets,
  onChange,
  onImport,
}: {
  param: EffectParam;
  value: number | boolean | string;
  assets: ReturnType<typeof useDocumentStore.getState>['doc']['assets'];
  onChange: (value: number | boolean | string) => void;
  onImport?: (() => Promise<void>) | undefined;
}) {
  switch (param.kind) {
    case 'number':
      return (
        <NumberField
          label={param.label}
          value={Number(value)}
          min={param.min}
          max={param.max}
          defaultValue={param.default}
          {...(param.softMin !== undefined ? { softMin: param.softMin } : {})}
          {...(param.softMax !== undefined ? { softMax: param.softMax } : {})}
          {...(param.step !== undefined ? { step: param.step } : {})}
          {...(param.precision !== undefined ? { precision: param.precision } : {})}
          {...(param.unit !== undefined ? { unit: param.unit } : {})}
          {...(param.hint !== undefined ? { title: param.hint } : {})}
          onChange={(next) => onChange(param.integer ? Math.round(next) : next)}
        />
      );
    case 'boolean':
      return <Toggle label={param.label} checked={Boolean(value)} onChange={onChange} />;
    case 'color':
      return <ColorField label={param.label} value={String(value)} onChange={onChange} />;
    case 'select':
      return (
        <Field label={param.label}>
          <Select
            label={param.label}
            value={String(value)}
            onChange={(event) => onChange(event.target.value)}
          >
            {param.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'asset': {
      const current = String(value);
      const custom = current.startsWith('asset:') ? assets[current.slice(6)] : undefined;
      return (
        <Field label={param.label}>
          <Select
            label={param.label}
            value={current}
            onChange={(event) => {
              if (event.target.value === '__import') void onImport?.();
              else onChange(event.target.value);
            }}
          >
            {param.builtins.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
            {custom && <option value={current}>{custom.name}</option>}
            <option value="__import">Import .cube…</option>
          </Select>
          {onImport && (
            <IconButton size="sm" label="Import a .cube LUT" onClick={() => void onImport()}>
              <FileUp />
            </IconButton>
          )}
        </Field>
      );
    }
  }
}
