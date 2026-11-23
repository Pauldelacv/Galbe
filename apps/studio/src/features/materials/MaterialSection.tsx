import { MATERIAL_PRESETS, type MaterialSpec, type MeshNode } from '@galbe/core';
import { applyMaterialPreset } from '../../state/actions.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { Section } from '../../ui/Section.tsx';
import { updateMaterial } from '../inspector/edit.ts';
import { ColorField, NumberField } from '../inspector/fields.tsx';
import styles from './MaterialSection.module.css';

export function MaterialSection({ nodes }: { nodes: MeshNode[] }) {
  const materials = useDocumentStore((state) => state.doc.materials);
  const single = nodes.length === 1 ? materials[nodes[0]!.materialId] : undefined;
  const activePreset = nodes.every((node) => materials[node.materialId]?.preset === single?.preset)
    ? single?.preset
    : undefined;

  return (
    <Section id="material" title="Material">
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
            onClick={() =>
              applyMaterialPreset(
                nodes.map((node) => node.id),
                preset.id,
              )
            }
          >
            <span className={styles.swatch} style={{ background: preset.swatch }} />
            <span className={styles.presetName}>{preset.name}</span>
          </button>
        ))}
      </div>
      {single && <MaterialParameters id={single.id} />}
    </Section>
  );
}

function MaterialParameters({ id }: { id: string }) {
  const material = useDocumentStore((state) => state.doc.materials[id]);
  if (!material) return null;
  const set = (label: string, apply: (m: MaterialSpec) => void) =>
    updateMaterial(id, label, (draft) => apply(draft as MaterialSpec));

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
    </div>
  );
}
