import { BUILTIN_HDRIS } from '@galbe/assets';
import { builtinUri, FRAME_PRESETS, parseAssetUri, TONE_MAPPINGS } from '@galbe/core';
import { focalLengthToFov, fovToFocalLength } from '@galbe/engine';
import { Ban, Focus, ImageUp, RotateCcw } from 'lucide-react';
import { BUILTIN_BASE_URL } from '../../engine/studioEngine.ts';
import { pickFiles } from '../../lib/files.ts';
import { frameSelection, resetCamera, setFramePreset } from '../../state/actions.ts';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { Button, Field, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import { HDRI_ACCEPT, importHdriFile } from './importHdri.ts';
import styles from './SceneInspector.module.css';

const set = (label: string, recipe: Parameters<typeof documentApi.update>[0]) =>
  documentApi.update(recipe, { label, coalesce: `scene:${label}` });

const TONE_LABELS: Record<(typeof TONE_MAPPINGS)[number], string> = {
  neutral: 'Neutral (true colours)',
  agx: 'AgX (filmic)',
  aces: 'ACES (contrasty)',
  none: 'None (linear)',
};

export function SceneInspector() {
  return (
    <>
      <FormatSection />
      <BackgroundSection />
      <EnvironmentSection />
      <GroundSection />
      <CameraSection />
      <RenderSection />
    </>
  );
}

function FormatSection() {
  const frame = useDocumentStore((state) => state.doc.frame);
  return (
    <Section id="format" title="Format">
      <div className={styles.formats}>
        {FRAME_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.format}
            data-active={frame.preset === preset.id || undefined}
            title={`${preset.hint} — ${preset.width} × ${preset.height}`}
            onClick={() => setFramePreset(preset.id)}
            data-testid={`format-${preset.id}`}
          >
            <span
              className={styles.formatShape}
              style={{
                aspectRatio: `${preset.width} / ${preset.height}`,
                [preset.width >= preset.height ? 'width' : 'height']: 22,
              }}
            />
            {preset.id === 'a4' ? 'A4' : preset.id}
          </button>
        ))}
        <button
          type="button"
          className={styles.format}
          data-active={frame.preset === 'custom' || undefined}
          onClick={() =>
            set('Format', (draft) => {
              draft.frame.preset = 'custom';
            })
          }
        >
          <span className={styles.formatShape} data-custom style={{ width: 18, height: 18 }} />
          Custom
        </button>
      </div>
      {frame.preset === 'custom' && (
        <Field label="Size (px)">
          <NumberField
            label="W"
            value={frame.width}
            min={16}
            max={16384}
            step={1}
            dragStep={4}
            precision={0}
            onChange={(value) =>
              set('Frame width', (draft) => {
                draft.frame.width = Math.round(value);
              })
            }
          />
          <NumberField
            label="H"
            value={frame.height}
            min={16}
            max={16384}
            step={1}
            dragStep={4}
            precision={0}
            onChange={(value) =>
              set('Frame height', (draft) => {
                draft.frame.height = Math.round(value);
              })
            }
          />
        </Field>
      )}
    </Section>
  );
}

function BackgroundSection() {
  const background = useDocumentStore((state) => state.doc.background);
  return (
    <Section id="background" title="Background">
      <Segmented
        label="Background type"
        value={background.type}
        onChange={(type) =>
          set('Background', (draft) => {
            if (type === 'transparent') draft.background = { type };
            else if (type === 'color') draft.background = { type, color: '#16161a' };
            else draft.background = { type, blur: 0.6, intensity: 1 };
          })
        }
        options={[
          { value: 'transparent', label: 'None', title: 'Transparent (alpha) background' },
          { value: 'color', label: 'Colour' },
          { value: 'environment', label: 'HDRI', title: 'Show the environment image' },
        ]}
      />
      {background.type === 'color' && (
        <ColorField
          label="Colour"
          value={background.color}
          onChange={(value) =>
            set('Background colour', (draft) => {
              if (draft.background.type === 'color') draft.background.color = value;
            })
          }
        />
      )}
      {background.type === 'environment' && (
        <>
          <NumberField
            label="Blur"
            value={background.blur}
            min={0}
            max={1}
            defaultValue={0.6}
            onChange={(value) =>
              set('Background blur', (draft) => {
                if (draft.background.type === 'environment') draft.background.blur = value;
              })
            }
          />
          <NumberField
            label="Brightness"
            value={background.intensity}
            min={0}
            max={10}
            softMax={3}
            defaultValue={1}
            onChange={(value) =>
              set('Background brightness', (draft) => {
                if (draft.background.type === 'environment') draft.background.intensity = value;
              })
            }
          />
        </>
      )}
    </Section>
  );
}

function EnvironmentSection() {
  const environment = useDocumentStore((state) => state.doc.environment);
  const assets = useDocumentStore((state) => state.doc.assets);
  const parsed = environment.hdri ? parseAssetUri(environment.hdri) : null;
  const custom = parsed?.scheme === 'asset' ? assets[parsed.id] : undefined;

  const importFile = async () => {
    const [file] = await pickFiles(HDRI_ACCEPT);
    if (!file) return;
    try {
      await importHdriFile(file);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not import this file.', 'error');
    }
  };

  return (
    <Section
      id="environment"
      title="Lighting"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<ImageUp />}
          onClick={importFile}
          title="Import an equirectangular .hdr"
        >
          Import
        </Button>
      }
    >
      <div className={styles.hdris} role="group" aria-label="Environments">
        {BUILTIN_HDRIS.map((hdri) => {
          const uri = builtinUri(hdri.id);
          return (
            <button
              key={hdri.id}
              type="button"
              className={styles.hdri}
              data-active={environment.hdri === uri || undefined}
              title={`${hdri.name} — ${hdri.description} (${hdri.credit.title}, ${hdri.credit.authors.join(', ')}, CC0)`}
              onClick={() =>
                set('Environment', (draft) => {
                  draft.environment.hdri = uri;
                })
              }
            >
              <img
                src={`${BUILTIN_BASE_URL}${hdri.preview}`}
                alt=""
                loading="lazy"
                draggable={false}
              />
              <span>{hdri.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={styles.hdri}
          data-active={environment.hdri === null || undefined}
          title="No image-based lighting"
          onClick={() =>
            set('Environment', (draft) => {
              draft.environment.hdri = null;
            })
          }
        >
          <span className={styles.none}>
            <Ban />
          </span>
          <span>None</span>
        </button>
      </div>
      {custom && <div className={styles.custom}>Custom: {custom.name}</div>}
      <NumberField
        label="Intensity"
        value={environment.intensity}
        min={0}
        max={10}
        softMax={3}
        defaultValue={1}
        onChange={(value) =>
          set('Environment intensity', (draft) => {
            draft.environment.intensity = value;
          })
        }
      />
      <NumberField
        label="Rotation"
        value={environment.rotation}
        min={-360}
        max={360}
        softMin={-180}
        softMax={180}
        step={1}
        precision={0}
        unit="°"
        defaultValue={0}
        onChange={(value) =>
          set('Environment rotation', (draft) => {
            draft.environment.rotation = value;
          })
        }
      />
    </Section>
  );
}

function GroundSection() {
  const ground = useDocumentStore((state) => state.doc.ground);
  const shadow = ground.contactShadow;
  return (
    <Section
      id="ground"
      title="Contact shadow"
      actions={
        <Toggle
          label="Contact shadow"
          hideLabel
          checked={shadow.enabled}
          onChange={(enabled) =>
            set('Contact shadow', (draft) => {
              draft.ground.contactShadow.enabled = enabled;
            })
          }
        />
      }
    >
      {shadow.enabled && (
        <>
          <NumberField
            label="Opacity"
            value={shadow.opacity}
            min={0}
            max={1}
            defaultValue={0.55}
            onChange={(value) =>
              set('Shadow opacity', (draft) => {
                draft.ground.contactShadow.opacity = value;
              })
            }
          />
          <NumberField
            label="Softness"
            value={shadow.blur}
            min={0}
            max={10}
            defaultValue={2.5}
            onChange={(value) =>
              set('Shadow softness', (draft) => {
                draft.ground.contactShadow.blur = value;
              })
            }
          />
          <NumberField
            label="Reach"
            value={shadow.far}
            min={0.01}
            max={50}
            softMax={5}
            defaultValue={1.2}
            title="How far above the ground objects still cast a shadow"
            onChange={(value) =>
              set('Shadow reach', (draft) => {
                draft.ground.contactShadow.far = value;
              })
            }
          />
          <NumberField
            label="Offset"
            value={ground.offset}
            min={0}
            max={10}
            softMax={1}
            defaultValue={0.02}
            title="Gap between the content and the ground"
            onChange={(value) =>
              set('Ground offset', (draft) => {
                draft.ground.offset = value;
              })
            }
          />
          <ColorField
            label="Colour"
            value={shadow.color}
            onChange={(value) =>
              set('Shadow colour', (draft) => {
                draft.ground.contactShadow.color = value;
              })
            }
          />
        </>
      )}
    </Section>
  );
}

function CameraSection() {
  const camera = useDocumentStore((state) => state.doc.camera);
  return (
    <Section id="camera" title="Camera">
      <NumberField
        label="Focal length"
        value={Math.round(fovToFocalLength(camera.fov) * 10) / 10}
        min={10}
        max={400}
        softMin={14}
        softMax={200}
        step={1}
        precision={0}
        unit=" mm"
        defaultValue={50}
        title="35 mm-equivalent focal length"
        onChange={(value) =>
          documentApi.update(
            (draft) => {
              draft.camera.fov = focalLengthToFov(value);
            },
            {
              history: false,
            },
          )
        }
      />
      <div className={styles.buttons}>
        <Button size="sm" icon={<Focus />} onClick={frameSelection}>
          Frame all
        </Button>
        <Button size="sm" icon={<RotateCcw />} onClick={resetCamera}>
          Reset
        </Button>
      </div>
    </Section>
  );
}

function RenderSection() {
  const render = useDocumentStore((state) => state.doc.render);
  return (
    <Section id="render" title="Render" defaultOpen={false}>
      <Field label="Tone mapping">
        <Select
          label="Tone mapping"
          value={render.toneMapping}
          onChange={(event) =>
            set('Tone mapping', (draft) => {
              draft.render.toneMapping = event.target.value as (typeof TONE_MAPPINGS)[number];
            })
          }
        >
          {TONE_MAPPINGS.map((value) => (
            <option key={value} value={value}>
              {TONE_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <NumberField
        label="Exposure"
        value={render.exposure}
        min={0.05}
        max={8}
        softMax={3}
        defaultValue={1}
        onChange={(value) =>
          set('Exposure', (draft) => {
            draft.render.exposure = value;
          })
        }
      />
    </Section>
  );
}
