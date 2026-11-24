import type { ModelNode } from '@galbe/core';
import { useEngineStatus } from '../../engine/studioEngine.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { Field, Segmented, Toggle } from '../../ui/controls.tsx';
import { Section } from '../../ui/Section.tsx';
import { updateModel } from '../inspector/edit.ts';
import { NumberField } from '../inspector/fields.tsx';

export function ModelInspector({ node }: { node: ModelNode }) {
  const asset = useDocumentStore((state) => {
    const id = node.source.startsWith('asset:') ? node.source.slice(6) : '';
    return state.doc.assets[id];
  });
  const error = useEngineStatus((state) => state.errors[node.id]);
  return (
    <Section id="model" title="Object">
      <Field label="File">
        <span title={asset?.name}>
          {asset?.name ?? 'Model'} · {node.format.toUpperCase()}
          {asset ? ` · ${(asset.size / 1024 / 1024).toFixed(1)} MB` : ''}
        </span>
      </Field>
      {error && <p style={{ color: 'var(--g-danger)', margin: 0 }}>{error}</p>}
      <NumberField
        label="Fit size"
        value={node.fitSize}
        min={0}
        max={100}
        softMax={10}
        defaultValue={2}
        title="Longest side after import, in scene units (0 = the file's own scale)"
        onChange={(value) =>
          updateModel(node.id, 'Fit size', (draft) => {
            draft.fitSize = value;
          })
        }
      />
      <Field label="Pivot">
        <Segmented
          label="Pivot"
          value={node.pivot}
          onChange={(pivot) =>
            updateModel(node.id, 'Pivot', (draft) => {
              draft.pivot = pivot;
            })
          }
          options={[
            { value: 'center', label: 'Centre' },
            { value: 'bottom', label: 'Bottom', title: 'Stand the model on its base' },
            { value: 'original', label: 'File', title: 'Keep the origin from the file' },
          ]}
        />
      </Field>
      <Toggle
        label="Override materials"
        checked={node.overrideMaterial}
        onChange={(overrideMaterial) =>
          updateModel(node.id, 'Override materials', (draft) => {
            draft.overrideMaterial = overrideMaterial;
          })
        }
      />
    </Section>
  );
}
