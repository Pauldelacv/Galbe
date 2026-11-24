import {
  type Background,
  type GradientBackground,
  MAX_GRADIENT_STOPS,
  MAX_MESH_POINTS,
  MEDIA_FITS,
  parseAssetUri,
} from '@galbe/core';
import type { Draft } from 'immer';
import { ImageUp, Plus, Trash2 } from 'lucide-react';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { Button, Field, IconButton, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import styles from './Cover.module.css';
import {
  backgroundCss,
  defaultBackground,
  GRADIENT_PRESETS,
  pickBackgroundMedia,
} from './media.ts';

const TYPE_LABELS: Record<Background['type'], string> = {
  transparent: 'None (transparent)',
  color: 'Colour',
  environment: 'Environment (HDRI)',
  gradient: 'Gradient',
  image: 'Image',
  video: 'Video',
};

const set = (label: string, recipe: (draft: Draft<Background>) => void) =>
  documentApi.update(
    (draft) => {
      recipe(draft.background);
    },
    { label, coalesce: `background:${label}` },
  );

function setGradient(label: string, recipe: (draft: Draft<GradientBackground>) => void) {
  set(label, (draft) => {
    if (draft.type === 'gradient') recipe(draft);
  });
}

export function BackgroundSection() {
  const background = useDocumentStore((state) => state.doc.background);
  const assets = useDocumentStore((state) => state.doc.assets);
  const mediaUri =
    background.type === 'image'
      ? background.image
      : background.type === 'video'
        ? background.video
        : null;
  const mediaId = mediaUri ? parseAssetUri(mediaUri)?.id : undefined;
  const mediaName = mediaId ? assets[mediaId]?.name : undefined;

  return (
    <Section id="background" title="Background">
      <Field label="Type">
        <Select
          label="Background type"
          value={background.type}
          data-testid="background-type"
          onChange={(event) => {
            const type = event.target.value as Background['type'];
            documentApi.update(
              (draft) => {
                draft.background = defaultBackground(type, draft.background as Background);
              },
              { label: 'Background', animate: false },
            );
          }}
        >
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </Field>

      {background.type === 'color' && (
        <ColorField
          label="Colour"
          value={background.color}
          onChange={(value) =>
            set('Background colour', (draft) => {
              if (draft.type === 'color') draft.color = value;
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
                if (draft.type === 'environment') draft.blur = value;
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
                if (draft.type === 'environment') draft.intensity = value;
              })
            }
          />
        </>
      )}

      {(background.type === 'gradient' ||
        background.type === 'color' ||
        background.type === 'transparent') && (
        <div className={styles.presets} role="group" aria-label="Gradient presets">
          {GRADIENT_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className={styles.preset}
              title={preset.name}
              style={{ background: backgroundCss(preset.background) }}
              data-testid={`gradient-${preset.name.toLowerCase()}`}
              onClick={() =>
                documentApi.update(
                  (draft) => {
                    draft.background = structuredClone(preset.background);
                  },
                  { label: `Background: ${preset.name}`, animate: false },
                )
              }
            >
              <span>{preset.name}</span>
            </button>
          ))}
        </div>
      )}

      {background.type === 'gradient' && <GradientEditor background={background} />}

      {(background.type === 'image' || background.type === 'video') && (
        <>
          <Field label={background.type === 'image' ? 'Image' : 'Video'}>
            <Button
              size="sm"
              icon={<ImageUp />}
              onClick={() => void pickBackgroundMedia(background.type as 'image' | 'video')}
              title={mediaName ?? 'Choose a file (or drop one on the window)'}
            >
              <span className={styles.ellipsis}>{mediaName ?? 'Choose…'}</span>
            </Button>
          </Field>
          <Field label="Fit">
            <Segmented
              label="Fit"
              value={background.fit}
              onChange={(fit) =>
                set('Background fit', (draft) => {
                  if (draft.type === 'image' || draft.type === 'video') draft.fit = fit;
                })
              }
              options={MEDIA_FITS.map((fit) => ({
                value: fit,
                label: fit[0]!.toUpperCase() + fit.slice(1),
              }))}
            />
          </Field>
          <NumberField
            label="Zoom"
            value={background.scale}
            min={0.1}
            max={10}
            softMax={3}
            defaultValue={1}
            onChange={(value) =>
              set('Background zoom', (draft) => {
                if (draft.type === 'image' || draft.type === 'video') draft.scale = value;
              })
            }
          />
          <Field label="Offset">
            {(['X', 'Y'] as const).map((axis, index) => (
              <NumberField
                key={axis}
                label={axis}
                value={background.offset[index]!}
                min={-2}
                max={2}
                softMin={-0.5}
                softMax={0.5}
                defaultValue={0}
                onChange={(value) =>
                  set('Background offset', (draft) => {
                    if (draft.type === 'image' || draft.type === 'video')
                      draft.offset[index] = value;
                  })
                }
              />
            ))}
          </Field>
          <NumberField
            label="Brightness"
            value={background.brightness}
            min={0}
            max={4}
            softMax={2}
            defaultValue={1}
            onChange={(value) =>
              set('Background brightness', (draft) => {
                if (draft.type === 'image' || draft.type === 'video') draft.brightness = value;
              })
            }
          />
          {background.fit === 'contain' && (
            <ColorField
              label="Fill"
              value={background.color}
              onChange={(value) =>
                set('Background fill', (draft) => {
                  if (draft.type === 'image' || draft.type === 'video') draft.color = value;
                })
              }
            />
          )}
          {background.type === 'video' && (
            <>
              <NumberField
                label="Start at"
                value={background.startAt}
                min={0}
                max={36000}
                softMax={30}
                unit="s"
                defaultValue={0}
                onChange={(value) =>
                  set('Video start', (draft) => {
                    if (draft.type === 'video') draft.startAt = value;
                  })
                }
              />
              <NumberField
                label="Speed"
                value={background.speed}
                min={0.05}
                max={8}
                softMax={3}
                unit="×"
                defaultValue={1}
                onChange={(value) =>
                  set('Video speed', (draft) => {
                    if (draft.type === 'video') draft.speed = value;
                  })
                }
              />
              <Toggle
                label="Loop the clip"
                checked={background.loop}
                onChange={(loop) =>
                  set('Video loop', (draft) => {
                    if (draft.type === 'video') draft.loop = loop;
                  })
                }
              />
            </>
          )}
        </>
      )}
    </Section>
  );
}

function GradientEditor({ background }: { background: GradientBackground }) {
  const mesh = background.kind === 'mesh';
  return (
    <>
      <Field label="Kind">
        <Segmented
          label="Gradient kind"
          value={background.kind}
          onChange={(kind) =>
            setGradient('Gradient kind', (draft) => {
              draft.kind = kind;
            })
          }
          options={[
            { value: 'linear', label: 'Linear' },
            { value: 'radial', label: 'Radial' },
            { value: 'mesh', label: 'Mesh' },
          ]}
        />
      </Field>
      <div className={styles.gradientBar} style={{ background: backgroundCss(background) }} />
      {background.kind === 'linear' && (
        <NumberField
          label="Angle"
          value={background.angle}
          min={-360}
          max={360}
          softMin={0}
          softMax={360}
          unit="°"
          precision={0}
          defaultValue={180}
          onChange={(value) =>
            setGradient('Gradient angle', (draft) => {
              draft.angle = value;
            })
          }
        />
      )}
      {background.kind === 'radial' && (
        <>
          <Field label="Centre">
            {(['X', 'Y'] as const).map((axis, index) => (
              <NumberField
                key={axis}
                label={axis}
                value={background.center[index]!}
                min={-1}
                max={2}
                softMin={0}
                softMax={1}
                defaultValue={0.5}
                onChange={(value) =>
                  setGradient('Gradient centre', (draft) => {
                    draft.center[index] = value;
                  })
                }
              />
            ))}
          </Field>
          <NumberField
            label="Radius"
            value={background.radius}
            min={0.01}
            max={4}
            softMax={2}
            defaultValue={1}
            onChange={(value) =>
              setGradient('Gradient radius', (draft) => {
                draft.radius = value;
              })
            }
          />
        </>
      )}

      <div className={styles.listHeading}>
        <span>{mesh ? 'Colour points' : 'Colour stops'}</span>
        <IconButton
          label={mesh ? 'Add a colour point' : 'Add a colour stop'}
          size="sm"
          disabled={
            (mesh ? background.points.length : background.stops.length) >=
            (mesh ? MAX_MESH_POINTS : MAX_GRADIENT_STOPS)
          }
          onClick={() =>
            setGradient('Add colour', (draft) => {
              if (draft.kind === 'mesh')
                draft.points.push({ color: '#ffffff', position: [0.5, 0.5] });
              else {
                const last = draft.stops.at(-1);
                draft.stops.push({ color: last?.color ?? '#ffffff', position: 0.5 });
              }
            })
          }
        >
          <Plus />
        </IconButton>
      </div>
      {mesh
        ? background.points.map((point, index) => (
            <div key={index} className={styles.stopRow}>
              <ColorField
                label={`Point ${index + 1}`}
                value={point.color}
                onChange={(value) =>
                  setGradient('Point colour', (draft) => {
                    draft.points[index]!.color = value;
                  })
                }
              />
              <Field label="Position">
                {(['X', 'Y'] as const).map((axis, a) => (
                  <NumberField
                    key={axis}
                    label={axis}
                    value={point.position[a]!}
                    min={-1}
                    max={2}
                    softMin={0}
                    softMax={1}
                    onChange={(value) =>
                      setGradient('Point position', (draft) => {
                        draft.points[index]!.position[a] = value;
                      })
                    }
                  />
                ))}
                <IconButton
                  label="Remove point"
                  size="sm"
                  disabled={background.points.length <= 2}
                  onClick={() =>
                    setGradient('Remove colour', (draft) => {
                      draft.points.splice(index, 1);
                    })
                  }
                >
                  <Trash2 />
                </IconButton>
              </Field>
            </div>
          ))
        : background.stops.map((stop, index) => (
            <div key={index} className={styles.stopRow}>
              <ColorField
                label={`Stop ${index + 1}`}
                value={stop.color}
                onChange={(value) =>
                  setGradient('Stop colour', (draft) => {
                    draft.stops[index]!.color = value;
                  })
                }
              />
              <Field label="Position">
                <NumberField
                  label="At"
                  value={stop.position}
                  min={0}
                  max={1}
                  onChange={(value) =>
                    setGradient('Stop position', (draft) => {
                      draft.stops[index]!.position = value;
                    })
                  }
                />
                <IconButton
                  label="Remove stop"
                  size="sm"
                  disabled={background.stops.length <= 2}
                  onClick={() =>
                    setGradient('Remove colour', (draft) => {
                      draft.stops.splice(index, 1);
                    })
                  }
                >
                  <Trash2 />
                </IconButton>
              </Field>
            </div>
          ))}
      {mesh && (
        <NumberField
          label="Softness"
          value={background.softness}
          min={0.1}
          max={4}
          softMax={3}
          defaultValue={1}
          onChange={(value) =>
            setGradient('Gradient softness', (draft) => {
              draft.softness = value;
            })
          }
        />
      )}
      <NumberField
        label="Grain"
        value={background.noise}
        min={0}
        max={1}
        softMax={0.3}
        defaultValue={0.03}
        title="Fine dithering noise that hides banding"
        onChange={(value) =>
          setGradient('Gradient grain', (draft) => {
            draft.noise = value;
          })
        }
      />
    </>
  );
}
