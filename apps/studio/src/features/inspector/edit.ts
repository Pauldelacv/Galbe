import type {
  MaterialSpec,
  ModelNode,
  PrimitiveNode,
  SceneNode,
  ShapeNode,
  TextNode,
} from '@galbe/core';
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

export function updateDeformable(
  id: string,
  label: string,
  recipe: (node: Draft<TextNode | ShapeNode>) => void,
): void {
  updateNode(id, label, (node) => {
    if (node.type === 'text' || node.type === 'shape') recipe(node);
  });
}

export function updateShape(
  id: string,
  label: string,
  recipe: (node: Draft<ShapeNode>) => void,
): void {
  updateNode(id, label, (node) => {
    if (node.type === 'shape') recipe(node);
  });
}

export function updatePrimitive(
  id: string,
  label: string,
  recipe: (node: Draft<PrimitiveNode>) => void,
): void {
  updateNode(id, label, (node) => {
    if (node.type === 'primitive') recipe(node);
  });
}

export function updateModel(
  id: string,
  label: string,
  recipe: (node: Draft<ModelNode>) => void,
): void {
  updateNode(id, label, (node) => {
    if (node.type === 'model') recipe(node);
  });
}

/** Applies the same edit to several materials (multi-selection, whole shapes). */
export function updateMaterials(
  ids: readonly string[],
  label: string,
  recipe: (material: Draft<MaterialSpec>) => void,
): void {
  documentApi.update(
    (draft) => {
      for (const id of ids) {
        const material = draft.materials[id];
        if (material) recipe(material);
      }
    },
    { label, coalesce: `materials:${ids.join(',')}:${label}` },
  );
}
