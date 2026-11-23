import type { MaterialSpec, SceneNode, TextNode } from '@galbe/core';
import type { Draft } from 'immer';
import { documentApi } from '../../state/documentStore.ts';

/** Updates one node. Keyboard-sized edits with the same label merge into one undo step. */
export function updateNode(
  id: string,
  label: string,
  recipe: (node: Draft<SceneNode>) => void,
): void {
  documentApi.update(
    (draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === id);
      if (node) recipe(node);
    },
    { label, coalesce: `${id}:${label}` },
  );
}

export function updateText(
  id: string,
  label: string,
  recipe: (node: Draft<TextNode>) => void,
): void {
  updateNode(id, label, (node) => {
    if (node.type === 'text') recipe(node);
  });
}

export function updateMaterial(
  id: string,
  label: string,
  recipe: (material: Draft<MaterialSpec>) => void,
): void {
  documentApi.update(
    (draft) => {
      const material = draft.materials[id];
      if (material) recipe(material);
    },
    { label, coalesce: `material:${id}:${label}` },
  );
}
