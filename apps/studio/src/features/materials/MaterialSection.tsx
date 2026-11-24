import { BUILTIN_MATCAPS } from '@galbe/assets';
import {
  builtinUri,
  createMatcapMaterial,
  createMaterial,
  getMaterialPreset,
  MATERIAL_PRESETS,
  type MaterialSpec,
  type MeshNode,
  type PhysicalMaterial,
  projectAssetUri,
} from '@galbe/core';
import { BookmarkPlus, ImageUp, X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { BUILTIN_BASE_URL } from '../../engine/studioEngine.ts';
import { pickFiles } from '../../lib/files.ts';
import { putAsset } from '../../persistence/assetStore.ts';
import {
  libraryItemSpec,
  loadMaterialLibrary,
  removeFromLibrary,
  saveToLibrary,
  swatchFor,
  useMaterialLibrary,
} from '../../persistence/materialLibrary.ts';
import { documentApi, useDocumentStore } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, Field, Segmented, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updateMaterials } from '../inspector/edit.ts';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import { targetMaterialIds } from '../objects/importObjects.ts';
import styles from './MaterialSection.module.css';
import { TexturesSection } from './TexturesSection.tsx';

/** Replaces the given materials' specs, keeping each id. */
function replaceSpecs(ids: readonly string[], spec: Omit<MaterialSpec, 'id'>, label: string) {
  documentApi.update(
    (draft) => {
      for (const id of ids) draft.materials[id] = { ...structuredClone(spec), id } as MaterialSpec;
    },
    { label },
  );
}

export function MaterialSection({ nodes }: { nodes: MeshNode[] }) {
  const materials = useDocumentStore((state) => state.doc.materials);
  const activePath = useUiStore((state) => state.activePath);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute when inputs change
  const ids = useMemo(() => targetMaterialIds(), [nodes, activePath, materials]);
  const first = ids[0] ? materials[ids[0]] : undefined;
  const library = useMaterialLibrary((state) => state.items);
  const loaded = useMaterialLibrary((state) => state.loaded);

  useEffect(() => {
    if (!loaded) void loadMaterialLibrary();
  }, [loaded]);

  const overridden = nodes.filter((node) => node.type !== 'model' || node.overrideMaterial);
  if (!overridden.length || !first) {
    return (
      <Section id="material" title="Material">
        <p className={styles.note}>
          This object uses the materials from its file. Turn on “Override materials” to restyle it.
        </p>
      </Section>
    );
  }

  const activePreset = ids.every((id) => materials[id]?.preset === first.preset)
    ? first.preset
    : undefined;

  const setType = (type: MaterialSpec['type']) => {
    if (type === first.type) return;
    if (type === 'matcap') {
      const { id: _id, ...spec } = createMatcapMaterial({
        matcap: builtinUri(BUILTIN_MATCAPS[0]!.id),
        color: '#ffffff',
        preset: BUILTIN_MATCAPS[0]!.id,
      });
      replaceSpecs(ids, spec, 'Matcap material');
    } else {
      const { id: _id, ...spec } = createMaterial('glossy-plastic');
      replaceSpecs(ids, spec, 'Physical material');
    }
  };

  return (
    <>
      <Section
        id="material"
        title={ids.length > 1 ? `Material (${ids.length})` : 'Material'}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<BookmarkPlus />}
            title="Save this material to your library (kept in this browser, for every project)"
            onClick={() =>
              saveToLibrary(first, documentApi.get().assets).then(
                () => notify(`“${first.name}” saved to your library`, 'success'),
                () => notify('Could not save the material.', 'error'),
              )
            }
          >
            Save
          </Button>
        }
      >
        <div className={styles.typeRow}>
          <Segmented
            label="Material type"
            value={first.type}
            onChange={setType}
            options={[
              { value: 'physical', label: 'Physical', title: 'Lit by the HDRI and lights' },
              { value: 'matcap', label: 'Matcap', title: 'Baked look from a sphere image (unlit)' },
            ]}
          />
        </div>
        {first.type === 'physical' ? (
          <div className={styles.presets} role="group" aria-label="Material presets">
            {MATERIAL_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={styles.preset}
                data-active={activePreset === preset.id || undefined}
                title={`${preset.name} — ${preset.description}`}
                aria-label={preset.name}
                data-testid={`material-${preset.id}`}
                onClick={() => {
                  const { id: _id, ...spec } = createMaterial(preset.id);
                  replaceSpecs(ids, spec, `Material: ${getMaterialPreset(preset.id)!.name}`);
                }}
              >
                <span className={styles.swatch} style={{ background: preset.swatch }} />
                <span className={styles.presetName}>{preset.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <MatcapPicker ids={ids} current={first.type === 'matcap' ? first.matcap : ''} />
        )}
        {library.length > 0 && (
          <>
            <div className={styles.subheading}>My materials</div>
            <div className={styles.presets} role="group" aria-label="My materials">
              {library.map((item) => {
                const parsed = libraryItemSpec(item);
                if (!parsed) return null;
                return (
                  <div key={item.id} className={styles.libraryItem}>
                    <button
                      type="button"
                      className={styles.preset}
                      title={`${item.name} (from your library)`}
                      onClick={() =>
                        documentApi.update(
                          (draft) => {
                            for (const asset of parsed.assets) draft.assets[asset.id] = asset;
                            for (const id of ids)
                              draft.materials[id] = {
                                ...structuredClone(parsed.spec),
                                id,
                              } as MaterialSpec;
                          },
                          { label: `Material: ${item.name}` },
                        )
                      }
                    >
                      <span
                        className={styles.swatch}
                        style={{
                          background: swatchFor({ ...parsed.spec, id: '' } as MaterialSpec),
                        }}
                      />
                      <span className={styles.presetName}>{item.name}</span>
                    </button>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${item.name} from the library`}
                      title="Remove from library"
                      onClick={() => void removeFromLibrary(item.id)}
                    >
                      <X />
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        {first.type === 'physical' ? (
          <PhysicalParameters ids={ids} material={first} />
        ) : (
          <MatcapParameters ids={ids} material={first} />
        )}
      </Section>
      {first.type === 'physical' && <HolographicSection ids={ids} material={first} />}
      {first.type === 'physical' && <TexturesSection ids={ids} material={first} />}
    </>
  );
}

function MatcapPicker({ ids, current }: { ids: readonly string[]; current: string }) {
  const importMatcap = async () => {
    const [file] = await pickFiles('.png,.jpg,.jpeg,.webp');
    if (!file) return;
    const entry = await putAsset(await file.arrayBuffer(), {
      name: file.name,
      kind: 'image',
      meta: { source: 'upload', type: 'matcap' },
    });
    documentApi.update(
      (draft) => {
        draft.assets[entry.id] = entry;
        for (const id of ids) {
          const material = draft.materials[id];
          if (material?.type === 'matcap') {
            material.matcap = projectAssetUri(entry.id);
            material.preset = undefined;
          }
        }
      },
      { label: 'Import matcap' },
    );
  };
  return (
    <div className={styles.presets} role="group" aria-label="Matcaps">
      {BUILTIN_MATCAPS.map((matcap) => {
        const uri = builtinUri(matcap.id);
        return (
          <button
            key={matcap.id}
            type="button"
            className={styles.preset}
            data-active={current === uri || undefined}
            title={matcap.name}
            data-testid={`matcap-${matcap.id.split('/')[1]}`}
            onClick={() =>
              updateMaterials(ids, `Matcap: ${matcap.name}`, (m) => {
                if (m.type !== 'matcap') return;
                m.matcap = uri;
                m.preset = matcap.id;
                m.name = matcap.name;
              })
            }
          >
            <img className={styles.swatch} src={`${BUILTIN_BASE_URL}${matcap.file}`} alt="" />
            <span className={styles.presetName}>{matcap.name}</span>
          </button>
        );
      })}
      <button
        type="button"
        className={styles.preset}
        title="Use your own matcap image"
        onClick={importMatcap}
      >
        <span className={styles.swatch} data-import>
          <ImageUp />
        </span>
        <span className={styles.presetName}>Import…</span>
      </button>
    </div>
  );
}

function MatcapParameters({
  ids,
  material,
}: {
  ids: readonly string[];
  material: Extract<MaterialSpec, { type: 'matcap' }>;
}) {
  const set = (label: string, apply: (m: Extract<MaterialSpec, { type: 'matcap' }>) => void) =>
    updateMaterials(ids, label, (draft) => {
      if (draft.type === 'matcap') apply(draft as Extract<MaterialSpec, { type: 'matcap' }>);
    });
  return (
    <div className={styles.params}>
      <ColorField
        label="Tint"
        value={material.color}
        onChange={(value) =>
          set('Tint', (m) => {
            m.color = value;
          })
        }
      />
      <NumberField
        label="Opacity"
        value={material.opacity}
        min={0}
        max={1}
        defaultValue={1}
        onChange={(value) =>
          set('Opacity', (m) => {
            m.opacity = value;
          })
        }
      />
      <Toggle
        label="Flat shading"
        checked={material.flatShading}
        onChange={(value) =>
          set('Flat shading', (m) => {
            m.flatShading = value;
          })
        }
      />
    </div>
  );
}

type Physical = PhysicalMaterial;

function PhysicalParameters({ ids, material }: { ids: readonly string[]; material: Physical }) {
  const set = (label: string, apply: (m: Physical) => void) =>
    updateMaterials(ids, label, (draft) => {
      if (draft.type === 'physical') apply(draft as Physical);
    });

  return (
    <div className={styles.params}>
      <ColorField
        label="Colour"
        value={material.color}
        onChange={(value) =>
          set('Colour', (m) => {
            m.color = value;
          })
        }
      />
      <NumberField
        label="Metalness"
        value={material.metalness}
        min={0}
        max={1}
        defaultValue={0}
        onChange={(value) =>
          set('Metalness', (m) => {
            m.metalness = value;
          })
        }
      />
      <NumberField
        label="Roughness"
        value={material.roughness}
        min={0}
        max={1}
        defaultValue={0.5}
        onChange={(value) =>
          set('Roughness', (m) => {
            m.roughness = value;
          })
        }
      />
      <NumberField
        label="Transmission"
        value={material.transmission}
        min={0}
        max={1}
        defaultValue={0}
        title="Glass-like light transmission"
        onChange={(value) =>
          set('Transmission', (m) => {
            m.transmission = value;
          })
        }
      />
      {material.transmission > 0 && (
        <>
          <NumberField
            label="IOR"
            value={material.ior}
            min={1}
            max={2.333}
            step={0.01}
            defaultValue={1.5}
            title="Index of refraction (water 1.33, glass 1.5, diamond 2.42)"
            onChange={(value) =>
              set('IOR', (m) => {
                m.ior = value;
              })
            }
          />
          <NumberField
            label="Thickness"
            value={material.thickness}
            min={0}
            max={20}
            softMax={3}
            defaultValue={0.8}
            onChange={(value) =>
              set('Thickness', (m) => {
                m.thickness = value;
              })
            }
          />
          <NumberField
            label="Dispersion"
            value={material.dispersion}
            min={0}
            max={10}
            softMax={5}
            defaultValue={0}
            title="Rainbow fringes in refraction"
            onChange={(value) =>
              set('Dispersion', (m) => {
                m.dispersion = value;
              })
            }
          />
          <ColorField
            label="Tint"
            value={material.attenuationColor}
            onChange={(value) =>
              set('Tint', (m) => {
                m.attenuationColor = value;
                if (m.attenuationDistance === 0) m.attenuationDistance = 1;
              })
            }
          />
        </>
      )}
      <NumberField
        label="Clearcoat"
        value={material.clearcoat}
        min={0}
        max={1}
        defaultValue={0}
        onChange={(value) =>
          set('Clearcoat', (m) => {
            m.clearcoat = value;
          })
        }
      />
      {material.clearcoat > 0 && (
        <NumberField
          label="Coat rough."
          value={material.clearcoatRoughness}
          min={0}
          max={1}
          defaultValue={0}
          onChange={(value) =>
            set('Clearcoat roughness', (m) => {
              m.clearcoatRoughness = value;
            })
          }
        />
      )}
      <NumberField
        label="Iridescence"
        value={material.iridescence}
        min={0}
        max={1}
        defaultValue={0}
        onChange={(value) =>
          set('Iridescence', (m) => {
            m.iridescence = value;
          })
        }
      />
      <NumberField
        label="Sheen"
        value={material.sheen}
        min={0}
        max={1}
        defaultValue={0}
        onChange={(value) =>
          set('Sheen', (m) => {
            m.sheen = value;
          })
        }
      />
      {material.sheen > 0 && (
        <ColorField
          label="Sheen colour"
          value={material.sheenColor}
          onChange={(value) =>
            set('Sheen colour', (m) => {
              m.sheenColor = value;
            })
          }
        />
      )}
      <NumberField
        label="Anisotropy"
        value={material.anisotropy}
        min={0}
        max={1}
        defaultValue={0}
        title="Brushed-metal stretched highlights"
        onChange={(value) =>
          set('Anisotropy', (m) => {
            m.anisotropy = value;
          })
        }
      />
      {material.anisotropy > 0 && (
        <NumberField
          label="Direction"
          value={material.anisotropyRotation}
          min={-180}
          max={180}
          step={1}
          precision={0}
          unit="°"
          defaultValue={0}
          onChange={(value) =>
            set('Anisotropy direction', (m) => {
              m.anisotropyRotation = value;
            })
          }
        />
      )}
      <NumberField
        label="Specular"
        value={material.specularIntensity}
        min={0}
        max={1}
        defaultValue={1}
        onChange={(value) =>
          set('Specular', (m) => {
            m.specularIntensity = value;
          })
        }
      />
      <ColorField
        label="Emission"
        value={material.emissive}
        onChange={(value) =>
          set('Emission', (m) => {
            m.emissive = value;
          })
        }
      />
      <NumberField
        label="Glow"
        value={material.emissiveIntensity}
        min={0}
        max={100}
        softMax={5}
        defaultValue={0}
        onChange={(value) =>
          set('Glow', (m) => {
            m.emissiveIntensity = value;
          })
        }
      />
      <NumberField
        label="Reflections"
        value={material.envMapIntensity}
        min={0}
        max={10}
        softMax={3}
        defaultValue={1}
        title="How strongly the environment is reflected"
        onChange={(value) =>
          set('Reflections', (m) => {
            m.envMapIntensity = value;
          })
        }
      />
      <NumberField
        label="Opacity"
        value={material.opacity}
        min={0}
        max={1}
        defaultValue={1}
        onChange={(value) =>
          set('Opacity', (m) => {
            m.opacity = value;
          })
        }
      />
      <Toggle
        label="Flat shading"
        checked={material.flatShading}
        onChange={(value) =>
          set('Flat shading', (m) => {
            m.flatShading = value;
          })
        }
      />
    </div>
  );
}

function HolographicSection({ ids, material }: { ids: readonly string[]; material: Physical }) {
  const holo = material.holographic;
  const set = (label: string, apply: (h: Physical['holographic']) => void) =>
    updateMaterials(ids, label, (draft) => {
      if (draft.type === 'physical') apply(draft.holographic);
    });
  return (
    <Section
      id="holographic"
      title="Holographic"
      defaultOpen={false}
      actions={
        <Toggle
          label="Holographic"
          hideLabel
          checked={holo.enabled}
          onChange={(enabled) =>
            set('Holographic', (h) => {
              h.enabled = enabled;
            })
          }
        />
      }
    >
      {holo.enabled ? (
        <div className={styles.params}>
          <NumberField
            label="Strength"
            value={holo.strength}
            min={0}
            max={4}
            softMax={2}
            defaultValue={1}
            onChange={(value) =>
              set('Holo strength', (h) => {
                h.strength = value;
              })
            }
          />
          <NumberField
            label="Bands"
            value={holo.bands}
            min={0.1}
            max={20}
            softMax={8}
            defaultValue={2.5}
            onChange={(value) =>
              set('Holo bands', (h) => {
                h.bands = value;
              })
            }
          />
          <NumberField
            label="Hue shift"
            value={holo.shift}
            min={-360}
            max={360}
            step={1}
            precision={0}
            unit="°"
            defaultValue={0}
            onChange={(value) =>
              set('Holo hue', (h) => {
                h.shift = value;
              })
            }
          />
          <NumberField
            label="Edges"
            value={holo.fresnel}
            min={0}
            max={8}
            softMax={4}
            defaultValue={1.5}
            title="Concentrates the rainbow on grazing angles"
            onChange={(value) =>
              set('Holo edges', (h) => {
                h.fresnel = value;
              })
            }
          />
          <NumberField
            label="Lines"
            value={holo.lines}
            min={0}
            max={1}
            defaultValue={0.3}
            title="Fine diffraction lines"
            onChange={(value) =>
              set('Holo lines', (h) => {
                h.lines = value;
              })
            }
          />
        </div>
      ) : (
        <Field label=" ">
          <span className={styles.note}>
            A rainbow foil sheen that shifts with the viewing angle.
          </span>
        </Field>
      )}
    </Section>
  );
}
