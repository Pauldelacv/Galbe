import {
  addNode,
  createEffect,
  createId,
  createMaterial,
  createModelNode,
  createPrimitiveNode,
  createShapeNode,
  type EffectSpec,
  extensionOf,
  findNode,
  groupNodes,
  invert,
  type Light,
  LightSchema,
  type MaterialSpec,
  type ModelFormat,
  type PrimitiveKind,
  projectAssetUri,
  reparentNode,
  topLevelIds,
  transformPoint,
  ungroupNodes,
  worldMatrix,
} from '@galbe/core';
import { importSvg } from '@galbe/engine';
import type { Draft } from 'immer';
import { controller } from '../engine/studioEngine.ts';
import { putAsset } from '../persistence/assetStore.ts';
import { keepContentInFrame } from './actions.ts';
import { documentApi } from './documentStore.ts';
import { notify } from './toastStore.ts';
import { useUiStore } from './uiStore.ts';

const PRIMITIVE_NAMES: Record<PrimitiveKind, string> = {
  sphere: 'Sphere',
  roundedBox: 'Rounded box',
  torus: 'Torus',
  capsule: 'Capsule',
  cylinder: 'Cylinder',
  cone: 'Cone',
  ring: 'Ring',
  blob: 'Blob',
};
export const primitiveName = (kind: PrimitiveKind) => PRIMITIVE_NAMES[kind];

/** Where a new object goes: right of the existing content, vertically centred on it. */
function placementFor(size: number): [number, number, number] {
  const bounds = controller.bounds();
  if (!bounds) return [0, 0, 0];
  const x = bounds.max.x + size / 2 + 0.3;
  const y = (bounds.min.y + bounds.max.y) / 2;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100, 0];
}

function finishAdd(id: string): void {
  useUiStore.getState().select([id]);
  // Frame after the engine has built the new geometry.
  requestAnimationFrame(() => keepContentInFrame());
}

export function addPrimitive(kind: PrimitiveKind): string {
  const material = createMaterial(kind === 'blob' ? 'pearl' : 'glossy-plastic');
  const node = createPrimitiveNode({
    name: PRIMITIVE_NAMES[kind],
    kind,
    materialId: material.id,
    transform: { position: placementFor(1.5) },
  });
  documentApi.update((draft) => void addNode(draft, node, { materials: [material] }), {
    label: `Add ${PRIMITIVE_NAMES[kind].toLowerCase()}`,
  });
  finishAdd(node.id);
  return node.id;
}

/**
 * Adds extruded vector artwork. Paths sharing a fill colour share a material (tinted
 * glossy plastic), so a logo stays easy to restyle colour by colour.
 */
export async function addShapeFromSvg(
  text: string,
  options: { name?: string; file?: File } = {},
): Promise<string> {
  const imported = importSvg(text, `${createId().slice(0, 6)}-`);
  let source: string | null = null;
  let assetEntry = null;
  if (options.file || text.length < 5_000_000) {
    const bytes = new TextEncoder().encode(text);
    assetEntry = await putAsset(bytes, {
      name: options.file?.name ?? 'pasted.svg',
      kind: 'svg',
      mime: 'image/svg+xml',
      meta: { source: options.file ? 'upload' : 'paste' },
    });
    source = projectAssetUri(assetEntry.id);
  }
  const byColor = new Map<string, MaterialSpec>();
  const materialFor = (color: string) => {
    let material = byColor.get(color);
    if (!material) {
      material = createMaterial('glossy-plastic', { color, name: `Fill ${color}` });
      byColor.set(color, material);
    }
    return material;
  };
  const paths = imported.paths.map((path) => ({
    ...path,
    materialId: materialFor(path.sourceColor).id,
  }));
  const base = [...byColor.values()][0]!;
  const name =
    options.name ??
    (options.file ? options.file.name.replace(/\.svg$/i, '') : 'Pasted shape').slice(0, 60);
  const node = createShapeNode({
    name,
    source,
    viewBox: imported.viewBox,
    paths,
    materialId: base.id,
    transform: { position: placementFor(2) },
  });
  documentApi.update(
    (draft) => {
      if (assetEntry) draft.assets[assetEntry.id] = assetEntry;
      addNode(draft, node, { materials: [...byColor.values()] });
    },
    { label: 'Add shape' },
  );
  if (imported.skipped) notify(`${imported.skipped} empty or hidden path(s) were skipped.`, 'info');
  finishAdd(node.id);
  return node.id;
}

const MODEL_FORMATS: Record<string, ModelFormat> = {
  glb: 'glb',
  gltf: 'gltf',
  fbx: 'fbx',
  obj: 'obj',
};

export const MODEL_ACCEPT = '.glb,.gltf,.fbx,.obj';

export async function addModelFile(file: File): Promise<string> {
  const format = MODEL_FORMATS[extensionOf(file.name)];
  if (!format) throw new Error(`${file.name}: use GLB, GLTF, FBX or OBJ.`);
  const bytes = await file.arrayBuffer();
  if (format === 'gltf') {
    const json = new TextDecoder().decode(bytes);
    if (/"uri"\s*:\s*"(?!data:)/.test(json))
      throw new Error(
        `${file.name} references external files. Export it as a single .glb (or a .gltf with embedded data).`,
      );
  }
  const entry = await putAsset(bytes, {
    name: file.name,
    kind: 'model',
    meta: { source: 'upload' },
  });
  const material = createMaterial('clay');
  const node = createModelNode({
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
    source: projectAssetUri(entry.id),
    format,
    materialId: material.id,
    transform: { position: placementFor(2) },
  });
  documentApi.update(
    (draft) => {
      draft.assets[entry.id] = entry;
      addNode(draft, node, { materials: [material] });
    },
    { label: 'Add model' },
  );
  finishAdd(node.id);
  // Surface load errors (unsupported features, corrupt file) once the engine tried.
  void controller.whenReady().then(() => {
    const error = controller.status.errors.get(node.id);
    if (error) notify(error, 'error');
  });
  return node.id;
}

// — Grouping & hierarchy —

export function groupSelection(): void {
  const ids = useUiStore.getState().selection;
  if (!ids.length) return;
  let groupId: string | null = null;
  // Pivot at the centre of the selection, expressed in the common parent's space.
  const doc = documentApi.get();
  const top = topLevelIds(doc, ids);
  const parents = new Set(top.map((id) => findNode(doc, id)!.parentId));
  const parentId = parents.size === 1 ? [...parents][0]! : null;
  let pivot: [number, number, number] = [0, 0, 0];
  const boxes = top.map((id) => controller.bounds(id)).filter((b) => b !== null);
  if (boxes.length) {
    const box = boxes[0]!.clone();
    for (const b of boxes.slice(1)) box.union(b);
    const c = box.getCenter(box.min.clone());
    const inverse = parentId ? invert(worldMatrix(doc, parentId)) : null;
    const p = inverse ? transformPoint(inverse, [c.x, c.y, c.z]) : [c.x, c.y, c.z];
    pivot = p.map((v) => Math.round(v * 1000) / 1000) as [number, number, number];
  }
  documentApi.update(
    (draft) => {
      groupId = groupNodes(draft, ids, { pivot });
    },
    { label: 'Group' },
  );
  if (groupId) useUiStore.getState().select([groupId]);
}

export function ungroupSelection(): void {
  const doc = documentApi.get();
  const groups = useUiStore
    .getState()
    .selection.filter((id) => findNode(doc, id)?.type === 'group');
  if (!groups.length) return;
  let released: string[] = [];
  documentApi.update(
    (draft) => {
      released = ungroupNodes(draft, groups);
    },
    { label: 'Ungroup' },
  );
  useUiStore.getState().select(released);
}

/** Moves a layer into a group (or to the root) at a list index. */
export function moveLayer(id: string, parentId: string | null, index?: number): void {
  documentApi.update(
    (draft) => {
      reparentNode(draft, id, parentId, index);
    },
    { label: 'Move layer' },
  );
}

// — Effects —

export function addEffect(type: string): void {
  const effect = createEffect(type);
  documentApi.update((draft) => void draft.effects.push(effect), { label: 'Add effect' });
  useUiStore.getState().setExpandedEffect(effect.id);
}

export function removeEffect(id: string): void {
  documentApi.update(
    (draft) => {
      draft.effects = draft.effects.filter((effect) => effect.id !== id);
    },
    { label: 'Remove effect' },
  );
}

export function moveEffect(id: string, toIndex: number): void {
  documentApi.update(
    (draft) => {
      const from = draft.effects.findIndex((effect) => effect.id === id);
      if (from === -1) return;
      const [effect] = draft.effects.splice(from, 1);
      draft.effects.splice(Math.max(0, Math.min(toIndex, draft.effects.length)), 0, effect!);
    },
    { label: 'Reorder effects' },
  );
}

export function updateEffect(
  id: string,
  label: string,
  recipe: (effect: Draft<EffectSpec>) => void,
): void {
  documentApi.update(
    (draft) => {
      const effect = draft.effects.find((candidate) => candidate.id === id);
      if (effect) recipe(effect);
    },
    { label, coalesce: `effect:${id}:${label}` },
  );
}

// — Lights —

const LIGHT_NAMES: Record<Light['type'], string> = {
  directional: 'Key light',
  point: 'Point light',
  spot: 'Spot light',
};

export function addLight(type: Light['type']): void {
  const light = LightSchema.parse({ id: createId(), type, name: LIGHT_NAMES[type] });
  documentApi.update((draft) => void draft.lights.push(light), { label: 'Add light' });
}

export function removeLight(id: string): void {
  documentApi.update(
    (draft) => {
      draft.lights = draft.lights.filter((light) => light.id !== id);
    },
    { label: 'Remove light' },
  );
}

export function updateLight(
  id: string,
  label: string,
  recipe: (light: Draft<Light>) => void,
): void {
  documentApi.update(
    (draft) => {
      const light = draft.lights.find((candidate) => candidate.id === id);
      if (light) recipe(light);
    },
    { label, coalesce: `light:${id}:${label}` },
  );
}
