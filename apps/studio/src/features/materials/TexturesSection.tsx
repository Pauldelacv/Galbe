import {
  type PhysicalMaterial,
  projectAssetUri,
  TEXTURE_SLOTS,
  type TextureSlot,
} from '@galbe/core';
import { ImageUp, PackageOpen, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { assetSource } from '../../engine/studioEngine.ts';
import { pickFiles } from '../../lib/files.ts';
import { putAsset } from '../../persistence/assetStore.ts';
import { documentApi } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { Button, Field } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updateMaterials } from '../inspector/edit.ts';
import { NumberField } from '../inspector/fields.tsx';
import { applyTextureFiles, applyTextureZip } from '../objects/importObjects.ts';
import styles from './MaterialSection.module.css';

const SLOT_LABELS: Record<TextureSlot, string> = {
  map: 'Colour',
  normalMap: 'Normal',
  roughnessMap: 'Roughness',
  metalnessMap: 'Metalness',
  aoMap: 'Occlusion',
  emissiveMap: 'Emission',
  alphaMap: 'Opacity',
};

const IMAGE_ACCEPT = '.png,.jpg,.jpeg,.webp,.avif';

function Thumb({ uri }: { uri: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    assetSource.resolveUrl(uri).then(
      (value) => alive && setUrl(value),
      () => alive && setUrl(null),
    );
    return () => {
      alive = false;
    };
  }, [uri]);
  return url ? (
    <img className={styles.thumb} src={url} alt="" />
  ) : (
    <span className={styles.thumb} />
  );
}

export function TexturesSection({
  ids,
  material,
}: {
  ids: readonly string[];
  material: PhysicalMaterial;
}) {
  const textures = material.textures;
  const count = TEXTURE_SLOTS.filter((slot) => textures[slot]).length;
  const set = (label: string, apply: (m: PhysicalMaterial) => void) =>
    updateMaterials(ids, label, (draft) => {
      if (draft.type === 'physical') apply(draft as PhysicalMaterial);
    });

  const importSlot = async (slot: TextureSlot) => {
    const [file] = await pickFiles(IMAGE_ACCEPT);
    if (!file) return;
    const entry = await putAsset(await file.arrayBuffer(), { name: file.name, kind: 'image' });
    documentApi.update(
      (draft) => {
        draft.assets[entry.id] = entry;
        for (const id of ids) {
          const m = draft.materials[id];
          if (m?.type === 'physical') {
            m.textures[slot] = projectAssetUri(entry.id);
            if (slot === 'map') m.color = '#ffffff';
          }
        }
      },
      { label: `${SLOT_LABELS[slot]} map` },
    );
  };

  const importSet = async () => {
    const files = await pickFiles(`${IMAGE_ACCEPT},.zip`, true);
    if (!files.length) return;
    try {
      let applied = 0;
      const zip = files.find((file) => file.name.toLowerCase().endsWith('.zip'));
      if (zip) applied = await applyTextureZip(zip);
      else
        applied = await applyTextureFiles(
          await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              bytes: new Uint8Array(await file.arrayBuffer()),
            })),
          ),
        );
      notify(
        applied
          ? `${applied} map${applied > 1 ? 's' : ''} applied`
          : 'No recognisable texture maps (name them _Color, _Normal, _Roughness…).',
        applied ? 'success' : 'error',
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read the texture set.', 'error');
    }
  };

  return (
    <Section
      id="textures"
      title={count ? `Textures (${count})` : 'Textures'}
      defaultOpen={count > 0}
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<PackageOpen />}
          onClick={importSet}
          title="Import a PBR set: several images or a .zip (e.g. from ambientCG, CC0). Maps are matched by name."
        >
          Import set
        </Button>
      }
    >
      <p className={styles.note}>
        Free CC0 texture sets:{' '}
        <a href="https://ambientcg.com/list?type=material" target="_blank" rel="noreferrer">
          ambientCG
        </a>
        {' · '}
        <a href="https://polyhaven.com/textures" target="_blank" rel="noreferrer">
          Poly Haven
        </a>
        . Download a zip and drop it here.
      </p>
      <div className={styles.slots}>
        {TEXTURE_SLOTS.map((slot) => {
          const uri = textures[slot];
          return (
            <div key={slot} className={styles.slot}>
              {uri ? <Thumb uri={uri} /> : <span className={styles.thumb} data-empty />}
              <span className={styles.slotName}>{SLOT_LABELS[slot]}</span>
              {uri ? (
                <button
                  type="button"
                  className={styles.slotAction}
                  aria-label={`Remove ${SLOT_LABELS[slot]} map`}
                  title="Remove"
                  onClick={() =>
                    set(`Remove ${SLOT_LABELS[slot]} map`, (m) => {
                      m.textures[slot] = null;
                    })
                  }
                >
                  <X />
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.slotAction}
                  aria-label={`Import ${SLOT_LABELS[slot]} map`}
                  title="Import an image"
                  onClick={() => void importSlot(slot)}
                >
                  <ImageUp />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {count > 0 && (
        <div className={styles.params}>
          <Field label="Repeat">
            <NumberField
              label="U"
              value={material.uv.repeat[0]}
              min={0.001}
              max={1000}
              softMax={10}
              defaultValue={1}
              onChange={(value) =>
                set('Texture repeat', (m) => {
                  m.uv.repeat = [value, m.uv.repeat[1]];
                })
              }
            />
            <NumberField
              label="V"
              value={material.uv.repeat[1]}
              min={0.001}
              max={1000}
              softMax={10}
              defaultValue={1}
              onChange={(value) =>
                set('Texture repeat', (m) => {
                  m.uv.repeat = [m.uv.repeat[0], value];
                })
              }
            />
          </Field>
          <Field label="Offset">
            <NumberField
              label="U"
              value={material.uv.offset[0]}
              step={0.01}
              defaultValue={0}
              onChange={(value) =>
                set('Texture offset', (m) => {
                  m.uv.offset = [value, m.uv.offset[1]];
                })
              }
            />
            <NumberField
              label="V"
              value={material.uv.offset[1]}
              step={0.01}
              defaultValue={0}
              onChange={(value) =>
                set('Texture offset', (m) => {
                  m.uv.offset = [m.uv.offset[0], value];
                })
              }
            />
          </Field>
          <NumberField
            label="Rotation"
            value={material.uv.rotation}
            min={-360}
            max={360}
            step={1}
            precision={0}
            unit="°"
            defaultValue={0}
            onChange={(value) =>
              set('Texture rotation', (m) => {
                m.uv.rotation = value;
              })
            }
          />
          {textures.normalMap && (
            <NumberField
              label="Bumpiness"
              value={material.normalScale}
              min={-10}
              max={10}
              softMin={-3}
              softMax={3}
              defaultValue={1}
              onChange={(value) =>
                set('Normal strength', (m) => {
                  m.normalScale = value;
                })
              }
            />
          )}
          {textures.aoMap && (
            <NumberField
              label="Occlusion"
              value={material.aoIntensity}
              min={0}
              max={1}
              defaultValue={1}
              onChange={(value) =>
                set('Occlusion', (m) => {
                  m.aoIntensity = value;
                })
              }
            />
          )}
        </div>
      )}
    </Section>
  );
}
