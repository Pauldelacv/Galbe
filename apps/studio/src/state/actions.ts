import {
  addNode,
  createMaterial,
  createStarterDocument,
  createTextNode,
  DEFAULT_MATERIAL_PRESET_ID,
  duplicateNodes,
  type FontRef,
  type FramePresetId,
  getFramePreset,
  getMaterialPreset,
  isMeshNode,
  removeNodes,
} from '@galbe/core';
import { controller, viewport } from '../engine/studioEngine.ts';
import { openDocument } from '../persistence/session.ts';
import { ensureVisible, frameBounds } from '../viewport/cameraFit.ts';
import { documentApi, useDocumentStore } from './documentStore.ts';
import { useUiStore } from './uiStore.ts';

const selection = () => useUiStore.getState().selection;

/** Adds a text layer below existing content, selects it and focuses its text field. */
export function addText(options: { text?: string; font?: FontRef } = {}): string {
  const doc = documentApi.get();
  // New text reuses the look of the last text layer, so a series of words stays coherent.
  const lastText = [...doc.nodes].reverse().find((node) => node.type === 'text');
  const lastMaterial =
    lastText && isMeshNode(lastText) ? doc.materials[lastText.materialId] : undefined;
  const material = lastMaterial
    ? { ...lastMaterial, id: createMaterial().id }
    : createMaterial(DEFAULT_MATERIAL_PRESET_ID);
  const bounds = controller.bounds();
  const y = bounds ? Math.round((bounds.min.y - 0.75) * 100) / 100 : 0;
  const node = createTextNode({
    name: options.text ?? 'Text',
    text: options.text ?? 'Text',
    materialId: material.id,
    transform: { position: [0, y, 0] },
    ...(options.font
      ? { font: options.font }
      : lastText?.type === 'text'
        ? { font: lastText.font }
        : {}),
  });
  documentApi.update((draft) => void addNode(draft, node, { materials: [material] }), {
    label: 'Add text',
  });
  useUiStore.getState().select([node.id]);
  useUiStore.getState().requestTextFocus();
  keepContentInFrame();
  return node.id;
}

export function deleteSelection(): void {
  const ids = selection();
  if (!ids.length) return;
  documentApi.update((draft) => removeNodes(draft, ids), { label: 'Delete' });
  useUiStore.getState().select([]);
}

export function duplicateSelection(): void {
  const ids = selection();
  if (!ids.length) return;
  let copies: string[] = [];
  documentApi.update(
    (draft) => {
      copies = duplicateNodes(draft, ids);
    },
    { label: 'Duplicate' },
  );
  useUiStore.getState().select(copies);
}

export function toggleSelectionVisibility(): void {
  const ids = new Set(selection());
  if (!ids.size) return;
  documentApi.update(
    (draft) => {
      const nodes = draft.nodes.filter((node) => ids.has(node.id));
      const visible = !nodes.every((node) => node.visible);
      for (const node of nodes) node.visible = visible;
    },
    { label: 'Toggle visibility' },
  );
}

export function renameNode(id: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  documentApi.update(
    (draft) => {
      const node = draft.nodes.find((candidate) => candidate.id === id);
      if (node) node.name = trimmed;
    },
    { label: 'Rename' },
  );
}

/** Points the camera at the selection (or everything), keeping the viewing angle. */
export function frameSelection(): void {
  const ids = selection();
  const bounds = ids.length === 1 ? controller.bounds(ids[0]) : controller.bounds();
  if (!bounds) return;
  const doc = documentApi.get();
  const aspect = doc.frame.width / doc.frame.height;
  const fit = frameBounds(bounds, doc.camera, aspect);
  documentApi.update(
    (draft) => {
      draft.camera.position = fit.position;
      draft.camera.target = fit.target;
    },
    { history: false },
  );
}

/** Pulls the camera back if the content no longer fits the frame (format change, new layer). */
export function keepContentInFrame(): void {
  const bounds = controller.bounds();
  if (!bounds) return;
  const doc = documentApi.get();
  const fit = ensureVisible(bounds, doc.camera, doc.frame.width / doc.frame.height);
  if (!fit) return;
  documentApi.update(
    (draft) => {
      draft.camera.position = fit.position;
      draft.camera.target = fit.target;
    },
    { history: false },
  );
}

export function resetCamera(): void {
  const defaults = createStarterDocument().camera;
  documentApi.update(
    (draft) => {
      draft.camera.position = defaults.position;
      draft.camera.target = defaults.target;
      draft.camera.fov = defaults.fov;
    },
    { history: false },
  );
  frameSelection();
}

export function applyMaterialPreset(nodeIds: string[], presetId: string): void {
  const preset = getMaterialPreset(presetId);
  if (!preset) return;
  documentApi.update(
    (draft) => {
      for (const id of nodeIds) {
        const node = draft.nodes.find((candidate) => candidate.id === id);
        if (!node || !isMeshNode(node)) continue;
        const { id: _fresh, ...spec } = createMaterial(presetId);
        draft.materials[node.materialId] = { ...spec, id: node.materialId };
      }
    },
    { label: `Material: ${preset.name}` },
  );
}

export function setFramePreset(preset: FramePresetId): void {
  const definition = getFramePreset(preset);
  documentApi.update(
    (draft) => {
      draft.frame.preset = preset;
      if (definition) {
        draft.frame.width = definition.width;
        draft.frame.height = definition.height;
      }
    },
    { label: 'Format' },
  );
  keepContentInFrame();
}

export async function newProject(): Promise<void> {
  await openDocument(createStarterDocument(), { save: true });
}

export const undo = () => useDocumentStore.getState().undo();
export const redo = () => useDocumentStore.getState().redo();

/** Renderer limits, for UI hints. */
export const gpuInfo = () => viewport.gl?.capabilities;
