import { BUILTIN_HDRIS } from '@galbe/assets';
import { builtinUri, FRAME_PRESETS, type Light, parseAssetUri, TONE_MAPPINGS } from '@galbe/core';
import { focalLengthToFov, fovToFocalLength } from '@galbe/engine';
import { Ban, Eye, EyeOff, Focus, ImageUp, RotateCcw, Trash2 } from 'lucide-react';
import { BUILTIN_BASE_URL } from '../../engine/studioEngine.ts';
import { pickFiles } from '../../lib/files.ts';
import { frameSelection, resetCamera, setFramePreset } from '../../state/actions.ts';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { addLight, removeLight, updateLight } from '../../state/objectActions.ts';
import { notify } from '../../state/toastStore.ts';
import { Button, Field, IconButton, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { BackgroundSection } from '../cover/BackgroundSection.tsx';
import { ColorField, NumberField, VectorField } from '../inspector/fields.tsx';
import { CameraMotionSection } from '../motion/MotionSection.tsx';
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
      <LightsSection />
      <GroundSection />
      <ReflectionSection />
      <CameraSection />
      <CameraMotionSection />
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
      {environment.hdri?.startsWith('builtin:') && (
        <Field
          label="Quality"
          hint="Sharper reflections for large exports (downloaded once from Poly Haven, CC0)"
        >
          <Segmented
            label="HDRI resolution"
            value={environment.resolution}
            onChange={(resolution) =>
              set('Environment quality', (draft) => {
                draft.environment.resolution = resolution;
              })
            }
            options={[
              { value: '1k', label: '1K', title: 'Bundled, instant' },
              { value: '2k', label: '2K', title: 'Downloads ~6 MB' },
              { value: '4k', label: '4K', title: 'Downloads ~25 MB' },
            ]}
          />
        </Field>
      )}
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
        <Button size="sm" icon={<Focus />} onClick={() => frameSelection(true)}>
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

function ReflectionSection() {
  const reflection = useDocumentStore((state) => state.doc.ground.reflection);
  return (
    <Section
      id="reflection"
      title="Reflective floor"
      defaultOpen={false}
      actions={
        <Toggle
          label="Reflective floor"
          hideLabel
          checked={reflection.enabled}
          onChange={(enabled) =>
            set('Reflective floor', (draft) => {
              draft.ground.reflection.enabled = enabled;
            })
          }
        />
      }
    >
      {reflection.enabled ? (
        <>
          <NumberField
            label="Strength"
            value={reflection.strength}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(value) =>
              set('Reflection strength', (draft) => {
                draft.ground.reflection.strength = value;
              })
            }
          />
          <NumberField
            label="Blur"
            value={reflection.blur}
            min={0}
            max={1}
            defaultValue={0.35}
            onChange={(value) =>
              set('Reflection blur', (draft) => {
                draft.ground.reflection.blur = value;
              })
            }
          />
          <NumberField
            label="Edge fade"
            value={reflection.fade}
            min={0.01}
            max={5}
            defaultValue={1.5}
            onChange={(value) =>
              set('Reflection fade', (draft) => {
                draft.ground.reflection.fade = value;
              })
            }
          />
          <ColorField
            label="Floor"
            value={reflection.color}
            onChange={(value) =>
              set('Floor colour', (draft) => {
                draft.ground.reflection.color = value;
              })
            }
          />
          <NumberField
            label="Floor opacity"
            value={reflection.floorOpacity}
            min={0}
            max={1}
            defaultValue={0}
            onChange={(value) =>
              set('Floor opacity', (draft) => {
                draft.ground.reflection.floorOpacity = value;
              })
            }
          />
        </>
      ) : (
        <p className={styles.custom}>A glossy floor that mirrors the content.</p>
      )}
    </Section>
  );
}

const LIGHT_LABELS: Record<Light['type'], string> = {
  directional: 'Directional',
  point: 'Point',
  spot: 'Spot',
};

function LightsSection() {
  const lights = useDocumentStore((state) => state.doc.lights);
  return (
    <Section
      id="lights"
      title={lights.length ? `Lights (${lights.length})` : 'Lights'}
      defaultOpen={lights.length > 0}
      actions={
        <Select
          label="Add light"
          value=""
          className={styles.addLight}
          onChange={(event) => {
            if (event.target.value) addLight(event.target.value as Light['type']);
          }}
        >
          <option value="">+ Add</option>
          <option value="directional">Directional</option>
          <option value="point">Point</option>
          <option value="spot">Spot</option>
        </Select>
      }
    >
      {!lights.length && (
        <p className={styles.custom}>
          Add key, rim or coloured lights on top of the HDRI. They light physical materials.
        </p>
      )}
      {lights.map((light) => (
        <LightEditor key={light.id} light={light} />
      ))}
    </Section>
  );
}

function LightEditor({ light }: { light: Light }) {
  const edit = (label: string, recipe: (draft: Light) => void) =>
    updateLight(light.id, label, (draft) => recipe(draft as Light));
  return (
    <div className={styles.light} data-testid={`light-${light.type}`}>
      <div className={styles.lightHeader}>
        <span className={styles.lightSwatch} style={{ background: light.color }} />
        <span className={styles.lightName}>
          {light.name} · {LIGHT_LABELS[light.type]}
        </span>
        <IconButton
          size="sm"
          label={light.visible ? 'Turn off' : 'Turn on'}
          onClick={() =>
            edit('Toggle light', (l) => {
              l.visible = !l.visible;
            })
          }
        >
          {light.visible ? <Eye /> : <EyeOff />}
        </IconButton>
        <IconButton size="sm" label="Remove light" onClick={() => removeLight(light.id)}>
          <Trash2 />
        </IconButton>
      </div>
      <ColorField
        label="Colour"
        value={light.color}
        onChange={(value) =>
          edit('Light colour', (l) => {
            l.color = value;
          })
        }
      />
      <NumberField
        label="Intensity"
        value={light.intensity}
        min={0}
        max={1000}
        softMax={light.type === 'directional' ? 10 : 50}
        defaultValue={2}
        onChange={(value) =>
          edit('Light intensity', (l) => {
            l.intensity = value;
          })
        }
      />
      <VectorField
        label="Position"
        value={light.position}
        step={0.05}
        onChange={(value) =>
          edit('Light position', (l) => {
            l.position = value;
          })
        }
      />
      {light.type !== 'point' && (
        <VectorField
          label="Aim at"
          value={light.target}
          step={0.05}
          onChange={(value) =>
            edit('Light target', (l) => {
              if (l.type !== 'point') l.target = value;
            })
          }
        />
      )}
      {light.type === 'spot' && (
        <>
          <NumberField
            label="Cone"
            value={light.angle}
            min={1}
            max={89}
            step={1}
            precision={0}
            unit="°"
            defaultValue={30}
            onChange={(value) =>
              edit('Spot angle', (l) => {
                if (l.type === 'spot') l.angle = value;
              })
            }
          />
          <NumberField
            label="Softness"
            value={light.penumbra}
            min={0}
            max={1}
            defaultValue={0.5}
            onChange={(value) =>
              edit('Spot softness', (l) => {
                if (l.type === 'spot') l.penumbra = value;
              })
            }
          />
        </>
      )}
    </div>
  );
}
