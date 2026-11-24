import type { Overlay } from '@galbe/core';
import type { Draft } from 'immer';
import { Eye, EyeOff, Plus, Trash2, Type } from 'lucide-react';
import { useState } from 'react';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { type GridGuide, useUiStore } from '../../state/uiStore.ts';
import { Button, Field, IconButton, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { FontPicker } from '../fonts/FontPicker.tsx';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import { BackgroundSection } from './BackgroundSection.tsx';
import styles from './Cover.module.css';
import { addOverlay, removeOverlay } from './media.ts';

export function updateOverlay(id: string, label: string, recipe: (draft: Draft<Overlay>) => void) {
  documentApi.update(
    (draft) => {
      const overlay = draft.overlays.find((candidate) => candidate.id === id);
      if (overlay) recipe(overlay);
    },
    { label, coalesce: `overlay:${id}:${label}` },
  );
}

export function CoverInspector() {
  return (
    <>
      <BackgroundSection />
      <OverlaysSection />
      <GuidesSection />
    </>
  );
}

function OverlaysSection() {
  const overlays = useDocumentStore((state) => state.doc.overlays);
  const activeId = useUiStore((state) => state.activeOverlay);
  const active = overlays.find((overlay) => overlay.id === activeId) ?? overlays.at(-1);
  return (
    <Section
      id="overlays"
      title="Text overlays"
      actions={
        <IconButton
          label="Add a text overlay"
          size="sm"
          onClick={() => addOverlay()}
          data-testid="add-overlay"
        >
          <Plus />
        </IconButton>
      }
    >
      {!overlays.length && (
        <p className={styles.hint}>
          Flat 2D titles drawn over the render: headlines, captions, credits. They export with
          images and videos and can be animated like anything else.
        </p>
      )}
      {overlays.length > 0 && (
        <ul className={styles.overlayList}>
          {[...overlays].reverse().map((overlay) => (
            <li key={overlay.id}>
              <button
                type="button"
                className={styles.overlayItem}
                data-active={overlay.id === active?.id || undefined}
                onClick={() => useUiStore.getState().setActiveOverlay(overlay.id)}
              >
                <Type />
                <span className={styles.ellipsis}>
                  {overlay.text.split('\n')[0] || overlay.name}
                </span>
              </button>
              <IconButton
                label={overlay.visible ? 'Hide' : 'Show'}
                size="sm"
                onClick={() =>
                  updateOverlay(overlay.id, 'Overlay visibility', (draft) => {
                    draft.visible = !draft.visible;
                  })
                }
              >
                {overlay.visible ? <Eye /> : <EyeOff />}
              </IconButton>
              <IconButton
                label="Delete overlay"
                size="sm"
                onClick={() => removeOverlay(overlay.id)}
              >
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {active && <OverlayEditor key={active.id} overlay={active} />}
    </Section>
  );
}

function OverlayEditor({ overlay }: { overlay: Overlay }) {
  const [picking, setPicking] = useState(false);
  const id = overlay.id;
  return (
    <div className={styles.editor}>
      <textarea
        className={styles.textarea}
        value={overlay.text}
        rows={2}
        spellCheck={false}
        aria-label="Overlay text"
        data-testid="overlay-text"
        onChange={(event) => {
          const text = event.target.value;
          updateOverlay(id, 'Overlay text', (draft) => {
            draft.text = text;
            draft.name = text.split('\n')[0]?.slice(0, 24) || 'Title';
          });
        }}
        onKeyDown={(event) => event.stopPropagation()}
      />
      <Field label="Font">
        <Button size="sm" icon={<Type />} onClick={() => setPicking(true)}>
          <span className={styles.ellipsis}>
            {overlay.font.family} {overlay.font.weight}
          </span>
        </Button>
      </Field>
      <NumberField
        label="Size"
        value={overlay.size * 100}
        min={0.2}
        max={200}
        softMax={30}
        step={0.1}
        unit="%"
        defaultValue={8}
        title="Em size as a percentage of the frame height"
        onChange={(value) =>
          updateOverlay(id, 'Overlay size', (draft) => {
            draft.size = value / 100;
          })
        }
      />
      <ColorField
        label="Colour"
        value={overlay.color}
        onChange={(value) =>
          updateOverlay(id, 'Overlay colour', (draft) => {
            draft.color = value;
          })
        }
      />
      <NumberField
        label="Opacity"
        value={overlay.opacity}
        min={0}
        max={1}
        defaultValue={1}
        onChange={(value) =>
          updateOverlay(id, 'Overlay opacity', (draft) => {
            draft.opacity = value;
          })
        }
      />
      <Field label="Position">
        {(['X', 'Y'] as const).map((axis, index) => (
          <NumberField
            key={axis}
            label={axis}
            value={overlay.position[index]! * 100}
            min={-100}
            max={200}
            softMin={0}
            softMax={100}
            unit="%"
            precision={1}
            onChange={(value) =>
              updateOverlay(id, 'Overlay position', (draft) => {
                draft.position[index] = value / 100;
              })
            }
          />
        ))}
      </Field>
      <Segmented
        label="Alignment"
        value={overlay.align}
        onChange={(align) =>
          updateOverlay(id, 'Overlay align', (draft) => {
            draft.align = align;
          })
        }
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ]}
      />
      <NumberField
        label="Letter spacing"
        value={overlay.letterSpacing}
        min={-0.5}
        max={2}
        softMax={0.5}
        step={0.005}
        precision={3}
        unit=" em"
        defaultValue={0}
        onChange={(value) =>
          updateOverlay(id, 'Overlay letter spacing', (draft) => {
            draft.letterSpacing = value;
          })
        }
      />
      <NumberField
        label="Line height"
        value={overlay.lineHeight}
        min={0.5}
        max={4}
        softMax={2}
        unit=" em"
        defaultValue={1.1}
        onChange={(value) =>
          updateOverlay(id, 'Overlay line height', (draft) => {
            draft.lineHeight = value;
          })
        }
      />
      <NumberField
        label="Rotation"
        value={overlay.rotation}
        min={-360}
        max={360}
        softMin={-90}
        softMax={90}
        unit="°"
        precision={1}
        defaultValue={0}
        onChange={(value) =>
          updateOverlay(id, 'Overlay rotation', (draft) => {
            draft.rotation = value;
          })
        }
      />
      <NumberField
        label="Shadow"
        value={overlay.shadow}
        min={0}
        max={1}
        defaultValue={0}
        onChange={(value) =>
          updateOverlay(id, 'Overlay shadow', (draft) => {
            draft.shadow = value;
          })
        }
      />
      <Toggle
        label="Uppercase"
        checked={overlay.uppercase}
        onChange={(uppercase) =>
          updateOverlay(id, 'Overlay case', (draft) => {
            draft.uppercase = uppercase;
          })
        }
      />
      <p className={styles.hint}>Drag the overlay in the frame to move it.</p>
      {picking && (
        <FontPicker
          current={overlay.font}
          sample={overlay.text}
          onClose={() => setPicking(false)}
          onPick={(font) =>
            updateOverlay(id, 'Overlay font', (draft) => {
              draft.font = font;
            })
          }
        />
      )}
    </div>
  );
}

const GRID_OPTIONS: { value: GridGuide; label: string }[] = [
  { value: 'off', label: 'No grid' },
  { value: 'thirds', label: 'Rule of thirds' },
  { value: 'golden', label: 'Golden ratio' },
  { value: 'columns', label: 'Columns' },
];

function GuidesSection() {
  const guides = useUiStore((state) => state.guides);
  const preset = useDocumentStore((state) => state.doc.frame.preset);
  const setGuides = useUiStore((state) => state.setGuides);
  return (
    <Section id="guides" title="Guides">
      <Toggle
        label={preset === '9:16' ? 'Safe zones (incl. app UI)' : 'Safe zones'}
        checked={guides.safe}
        onChange={(safe) => setGuides({ safe })}
      />
      <Toggle
        label="Centre lines"
        checked={guides.center}
        onChange={(center) => setGuides({ center })}
      />
      <Field label="Grid">
        <Select
          label="Grid"
          value={guides.grid}
          onChange={(event) => setGuides({ grid: event.target.value as GridGuide })}
        >
          {GRID_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      {guides.grid === 'columns' && (
        <NumberField
          label="Columns"
          value={guides.columns}
          min={2}
          max={24}
          step={1}
          precision={0}
          defaultValue={6}
          onChange={(value) => setGuides({ columns: Math.round(value) })}
        />
      )}
      <p className={styles.hint}>Guides are drawn in the studio only — never in exports.</p>
    </Section>
  );
}
