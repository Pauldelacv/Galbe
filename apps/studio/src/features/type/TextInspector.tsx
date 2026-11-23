import { getBuiltinFontFamily } from '@galbe/assets';
import type { TextNode } from '@galbe/core';
import { AlignCenter, AlignLeft, AlignRight, Type } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, Field, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { builtinFontRef, FontPicker } from '../fonts/FontPicker.tsx';
import { updateText } from '../inspector/edit.ts';
import { NumberField } from '../inspector/fields.tsx';
import styles from './TextInspector.module.css';

export function TextInspector({ node }: { node: TextNode }) {
  return (
    <>
      <TextSection node={node} />
      <ExtrusionSection node={node} />
      <DeformSection node={node} />
    </>
  );
}

function TextSection({ node }: { node: TextNode }) {
  const [picking, setPicking] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const focusRequest = useUiStore((state) => state.focusTextRequest);
  const builtin = getBuiltinFontFamily(node.font.family);

  useEffect(() => {
    if (!focusRequest) return;
    const element = textarea.current;
    if (!element) return;
    element.focus();
    element.select();
  }, [focusRequest]);

  return (
    <Section id="text" title="Text">
      <textarea
        ref={textarea}
        className={styles.textarea}
        value={node.text}
        rows={Math.min(6, Math.max(2, node.text.split('\n').length))}
        spellCheck={false}
        aria-label="Text content"
        data-testid="text-content"
        onChange={(event) => {
          const value = event.target.value;
          updateText(node.id, 'Edit text', (draft) => {
            draft.text = value;
            const firstLine = value.split('\n')[0]?.trim();
            if (
              firstLine &&
              (draft.name === 'Text' || draft.name === node.text.split('\n')[0]?.trim())
            ) {
              draft.name = firstLine.slice(0, 40);
            }
          });
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
      />
      <Field label="Font">
        <Button
          className={styles.fontButton}
          icon={<Type />}
          onClick={() => setPicking(true)}
          data-testid="font-button"
        >
          <span className={styles.fontName}>{node.font.family}</span>
        </Button>
      </Field>
      {builtin && builtin.faces.length > 1 && (
        <Field label="Style">
          <Select
            label="Font style"
            value={`${node.font.weight}-${node.font.style}`}
            onChange={(event) => {
              const [weight, style] = event.target.value.split('-');
              const font = builtinFontRef(
                builtin,
                Number(weight),
                style === 'italic' ? 'italic' : 'normal',
              );
              updateText(node.id, 'Font style', (draft) => {
                draft.font = font;
              });
            }}
          >
            {builtin.faces.map((face) => (
              <option key={`${face.weight}-${face.style}`} value={`${face.weight}-${face.style}`}>
                {face.weight} {face.style === 'italic' ? 'Italic' : ''}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <NumberField
        label="Size"
        value={node.size}
        min={0.01}
        max={100}
        softMin={0.1}
        softMax={4}
        step={0.05}
        defaultValue={1}
        onChange={(value) =>
          updateText(node.id, 'Size', (draft) => {
            draft.size = value;
          })
        }
      />
      <Segmented
        label="Alignment"
        value={node.align}
        onChange={(align) =>
          updateText(node.id, 'Align', (draft) => {
            draft.align = align;
          })
        }
        options={[
          { value: 'left', label: <AlignLeft />, title: 'Align left' },
          { value: 'center', label: <AlignCenter />, title: 'Align centre' },
          { value: 'right', label: <AlignRight />, title: 'Align right' },
        ]}
      />
      <NumberField
        label="Letter spacing"
        value={node.letterSpacing}
        min={-1}
        max={5}
        softMin={-0.2}
        softMax={0.5}
        step={0.005}
        precision={3}
        unit=" em"
        defaultValue={0}
        onChange={(value) =>
          updateText(node.id, 'Letter spacing', (draft) => {
            draft.letterSpacing = value;
          })
        }
      />
      <NumberField
        label="Line height"
        value={node.lineHeight}
        min={0.1}
        max={10}
        softMin={0.5}
        softMax={2.5}
        step={0.01}
        unit=" em"
        defaultValue={1.1}
        onChange={(value) =>
          updateText(node.id, 'Line height', (draft) => {
            draft.lineHeight = value;
          })
        }
      />
      {picking && (
        <FontPicker
          current={node.font}
          sample={node.text}
          onClose={() => setPicking(false)}
          onPick={(font) =>
            updateText(node.id, 'Font', (draft) => {
              draft.font = font;
            })
          }
        />
      )}
    </Section>
  );
}

function ExtrusionSection({ node }: { node: TextNode }) {
  const { bevel } = node;
  return (
    <Section id="extrusion" title="Extrusion">
      <NumberField
        label="Depth"
        value={node.depth}
        min={0}
        max={100}
        softMin={0}
        softMax={2}
        step={0.01}
        defaultValue={0.3}
        onChange={(value) =>
          updateText(node.id, 'Depth', (draft) => {
            draft.depth = value;
          })
        }
      />
      <NumberField
        label="Smoothness"
        value={node.curveSegments}
        min={1}
        max={32}
        step={1}
        dragStep={0.1}
        precision={0}
        defaultValue={8}
        title="Curve segments per outline segment"
        onChange={(value) =>
          updateText(node.id, 'Smoothness', (draft) => {
            draft.curveSegments = Math.round(value);
          })
        }
      />
      <div className={styles.toggleRow}>
        <Toggle
          label="Bevel"
          checked={bevel.enabled}
          onChange={(enabled) =>
            updateText(node.id, 'Bevel', (draft) => {
              draft.bevel.enabled = enabled;
            })
          }
        />
      </div>
      {bevel.enabled && (
        <>
          <NumberField
            label="Bevel size"
            value={bevel.size}
            min={0}
            max={1}
            softMax={0.12}
            step={0.002}
            precision={3}
            defaultValue={0.02}
            onChange={(value) =>
              updateText(node.id, 'Bevel size', (draft) => {
                draft.bevel.size = value;
              })
            }
          />
          <NumberField
            label="Bevel depth"
            value={bevel.thickness}
            min={0}
            max={1}
            softMax={0.15}
            step={0.002}
            precision={3}
            defaultValue={0.03}
            onChange={(value) =>
              updateText(node.id, 'Bevel depth', (draft) => {
                draft.bevel.thickness = value;
              })
            }
          />
          <NumberField
            label="Bevel segments"
            value={bevel.segments}
            min={1}
            max={16}
            step={1}
            dragStep={0.08}
            precision={0}
            defaultValue={4}
            onChange={(value) =>
              updateText(node.id, 'Bevel segments', (draft) => {
                draft.bevel.segments = Math.round(value);
              })
            }
          />
        </>
      )}
    </Section>
  );
}

function DeformSection({ node }: { node: TextNode }) {
  const { bend, twist, wave } = node.deform;
  return (
    <Section id="deform" title="Deform">
      <div className={styles.toggleRow}>
        <Toggle
          label="Bend"
          checked={bend.enabled}
          onChange={(enabled) =>
            updateText(node.id, 'Bend', (draft) => {
              draft.deform.bend.enabled = enabled;
            })
          }
        />
        {bend.enabled && (
          <Segmented
            label="Bend mode"
            value={bend.mode}
            onChange={(mode) =>
              updateText(node.id, 'Bend mode', (draft) => {
                draft.deform.bend.mode = mode;
              })
            }
            options={[
              { value: 'arc', label: 'Arc', title: 'Curve the baseline' },
              { value: 'wrap', label: 'Wrap', title: 'Wrap around a cylinder' },
            ]}
          />
        )}
      </div>
      {bend.enabled && (
        <NumberField
          label="Angle"
          value={bend.angle}
          min={-360}
          max={360}
          step={1}
          precision={0}
          unit="°"
          defaultValue={60}
          onChange={(value) =>
            updateText(node.id, 'Bend angle', (draft) => {
              draft.deform.bend.angle = value;
            })
          }
        />
      )}
      <div className={styles.toggleRow}>
        <Toggle
          label="Twist"
          checked={twist.enabled}
          onChange={(enabled) =>
            updateText(node.id, 'Twist', (draft) => {
              draft.deform.twist.enabled = enabled;
            })
          }
        />
      </div>
      {twist.enabled && (
        <NumberField
          label="Angle"
          value={twist.angle}
          min={-1440}
          max={1440}
          softMin={-360}
          softMax={360}
          step={1}
          precision={0}
          unit="°"
          defaultValue={90}
          onChange={(value) =>
            updateText(node.id, 'Twist angle', (draft) => {
              draft.deform.twist.angle = value;
            })
          }
        />
      )}
      <div className={styles.toggleRow}>
        <Toggle
          label="Wave"
          checked={wave.enabled}
          onChange={(enabled) =>
            updateText(node.id, 'Wave', (draft) => {
              draft.deform.wave.enabled = enabled;
            })
          }
        />
        {wave.enabled && (
          <Segmented
            label="Wave axis"
            value={wave.axis}
            onChange={(axis) =>
              updateText(node.id, 'Wave axis', (draft) => {
                draft.deform.wave.axis = axis;
              })
            }
            options={[
              { value: 'z', label: 'Depth', title: 'Ripple towards the camera' },
              { value: 'y', label: 'Height', title: 'Ripple up and down' },
            ]}
          />
        )}
      </div>
      {wave.enabled && (
        <>
          <NumberField
            label="Amplitude"
            value={wave.amplitude}
            min={0}
            max={5}
            softMax={1}
            step={0.01}
            defaultValue={0.15}
            onChange={(value) =>
              updateText(node.id, 'Wave amplitude', (draft) => {
                draft.deform.wave.amplitude = value;
              })
            }
          />
          <NumberField
            label="Frequency"
            value={wave.frequency}
            min={0}
            max={20}
            softMax={5}
            step={0.05}
            defaultValue={1}
            onChange={(value) =>
              updateText(node.id, 'Wave frequency', (draft) => {
                draft.deform.wave.frequency = value;
              })
            }
          />
          <NumberField
            label="Phase"
            value={wave.phase}
            min={-360}
            max={360}
            step={1}
            precision={0}
            unit="°"
            defaultValue={0}
            onChange={(value) =>
              updateText(node.id, 'Wave phase', (draft) => {
                draft.deform.wave.phase = value;
              })
            }
          />
        </>
      )}
    </Section>
  );
}
