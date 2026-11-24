import { createGroupNode } from './factories.ts';
import { createId } from './ids.ts';
import type { GalbeDocument } from './schema/document.ts';
import type { MaterialSpec } from './schema/material.ts';
import { isMeshNode, nodeMaterialIds, type SceneNode } from './schema/nodes.ts';
import {
  composeTransform,
  decomposeTransform,
  identity,
  invert,
  type Mat4,
  multiply,
} from './transform.ts';

/*
 * Document operations. They MUTATE the document they receive, which makes them usable
 * inside an Immer `produce` recipe (structural sharing, cheap undo snapshots) as well
 * as on a `structuredClone` in tests or scripts.
 */

export function findNode(doc: GalbeDocument, id: string): SceneNode | undefined {
  return doc.nodes.find((node) => node.id === id);
}

export function nodeIndex(doc: GalbeDocument, id: string): number {
  return doc.nodes.findIndex((node) => node.id === id);
}

/** Direct children, in list order. */
export function childrenOf(doc: GalbeDocument, parentId: string | null): SceneNode[] {
  return doc.nodes.filter((node) => node.parentId === parentId);
}

/** The node ids plus every descendant id. */
export function withDescendants(doc: GalbeDocument, ids: Iterable<string>): Set<string> {
  const result = new Set(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of doc.nodes) {
      if (node.parentId !== null && result.has(node.parentId) && !result.has(node.id)) {
        result.add(node.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Whether a node and all its ancestors are visible. */
export function isEffectivelyVisible(doc: GalbeDocument, id: string): boolean {
  let node = findNode(doc, id);
  const seen = new Set<string>();
  while (node) {
    if (!node.visible) return false;
    if (node.parentId === null || seen.has(node.id)) return true;
    seen.add(node.id);
    node = findNode(doc, node.parentId);
  }
  return true;
}

export interface AddNodeOptions {
  /** Insert position in `doc.nodes`; defaults to the end (top of the layer list). */
  index?: number;
  /** Materials the node(s) reference that are not yet in the document. */
  materials?: MaterialSpec[];
}

export function addNode(
  doc: GalbeDocument,
  node: SceneNode,
  options: AddNodeOptions = {},
): SceneNode {
  for (const material of options.materials ?? []) doc.materials[material.id] = material;
  const index = options.index ?? doc.nodes.length;
  doc.nodes.splice(Math.max(0, Math.min(index, doc.nodes.length)), 0, node);
  return node;
}

/** Removes nodes and their descendants, then drops materials nobody uses any more. */
export function removeNodes(doc: GalbeDocument, ids: Iterable<string>): void {
  const doomed = withDescendants(doc, ids);
  doc.nodes = doc.nodes.filter((node) => !doomed.has(node.id));
  pruneMaterials(doc);
}

export function pruneMaterials(doc: GalbeDocument): void {
  const used = new Set(doc.nodes.flatMap(nodeMaterialIds));
  for (const id of Object.keys(doc.materials)) {
    if (!used.has(id)) delete doc.materials[id];
  }
}

/**
 * Duplicates nodes (with descendants). Each copy gets its own material copy so editing
 * the duplicate never changes the original. Returns the ids of the top-level copies.
 */
export function duplicateNodes(
  doc: GalbeDocument,
  ids: string[],
  offset: [number, number, number] = [0.25, -0.25, 0],
): string[] {
  const source = withDescendants(doc, ids);
  const idMap = new Map<string, string>();
  for (const id of source) idMap.set(id, createId());
  const topLevel: string[] = [];
  const copies: SceneNode[] = [];
  for (const node of doc.nodes) {
    if (!source.has(node.id)) continue;
    const copy = structuredClone(node) as SceneNode;
    copy.id = idMap.get(node.id)!;
    const isTop = node.parentId === null || !source.has(node.parentId);
    copy.parentId = isTop ? node.parentId : idMap.get(node.parentId!)!;
    if (isTop) {
      copy.name = `${node.name} copy`;
      copy.transform.position = [
        node.transform.position[0] + offset[0],
        node.transform.position[1] + offset[1],
        node.transform.position[2] + offset[2],
      ];
      topLevel.push(copy.id);
    }
    if (isMeshNode(copy)) {
      const remap = new Map<string, string>();
      for (const materialId of nodeMaterialIds(copy)) {
        const material = doc.materials[materialId];
        if (!material) continue;
        const materialCopy = { ...structuredClone(material), id: createId() };
        doc.materials[materialCopy.id] = materialCopy;
        remap.set(materialId, materialCopy.id);
      }
      copy.materialId = remap.get(copy.materialId) ?? copy.materialId;
      if (copy.type === 'shape')
        for (const path of copy.paths)
          if (path.materialId) path.materialId = remap.get(path.materialId) ?? path.materialId;
    }
    copies.push(copy);
  }
  // Insert copies right after the last selected node to keep them near the originals.
  const lastIndex = Math.max(...[...source].map((id) => nodeIndex(doc, id)));
  doc.nodes.splice(lastIndex + 1, 0, ...copies);
  return topLevel;
}

/** Moves a node to `toIndex` in `doc.nodes` (clamped). */
export function reorderNode(doc: GalbeDocument, id: string, toIndex: number): void {
  const from = nodeIndex(doc, id);
  if (from === -1) return;
  const [node] = doc.nodes.splice(from, 1);
  doc.nodes.splice(Math.max(0, Math.min(toIndex, doc.nodes.length)), 0, node!);
}

/** Replaces a mesh node's material with `spec`, keeping the node's material id stable. */
export function assignMaterial(
  doc: GalbeDocument,
  nodeId: string,
  spec: Omit<MaterialSpec, 'id'>,
): void {
  const node = findNode(doc, nodeId);
  if (!node || !isMeshNode(node)) return;
  const id = node.materialId;
  doc.materials[id] = { ...spec, id } as MaterialSpec;
}

/** Ancestors of a node, nearest first. */
export function ancestorsOf(doc: GalbeDocument, id: string): SceneNode[] {
  const out: SceneNode[] = [];
  const seen = new Set<string>([id]);
  let current = findNode(doc, id);
  while (current?.parentId && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    const parent = findNode(doc, current.parentId);
    if (!parent) break;
    out.push(parent);
    current = parent;
  }
  return out;
}

/** World matrix of a node (or identity for the root). */
export function worldMatrix(doc: GalbeDocument, id: string | null): Mat4 {
  if (id === null) return identity();
  const chain = [findNode(doc, id), ...ancestorsOf(doc, id)].filter(Boolean) as SceneNode[];
  let m = identity();
  for (const node of chain.reverse()) m = multiply(m, composeTransform(node.transform));
  return m;
}

/** Whether `ancestorId` is `id` or one of its ancestors. */
export function isAncestorOrSelf(doc: GalbeDocument, ancestorId: string, id: string): boolean {
  return ancestorId === id || ancestorsOf(doc, id).some((node) => node.id === ancestorId);
}

/** Keeps only ids with no selected ancestor (moving a parent already moves its children). */
export function topLevelIds(doc: GalbeDocument, ids: Iterable<string>): string[] {
  const set = new Set(ids);
  return doc.nodes
    .filter((node) => set.has(node.id) && !ancestorsOf(doc, node.id).some((a) => set.has(a.id)))
    .map((node) => node.id);
}

/**
 * Moves a node under a new parent (or the root), keeping its world transform. `index` is
 * the insert position in `doc.nodes` (defaults to right after the new parent's last child,
 * i.e. on top of its siblings). Refuses cycles.
 */
export function reparentNode(
  doc: GalbeDocument,
  id: string,
  parentId: string | null,
  index?: number,
): boolean {
  const node = findNode(doc, id);
  if (!node) return false;
  if (parentId !== null) {
    const parent = findNode(doc, parentId);
    if (parent?.type !== 'group' || isAncestorOrSelf(doc, id, parentId)) return false;
  }
  if (node.parentId !== parentId) {
    const world = worldMatrix(doc, id);
    const parentWorld = worldMatrix(doc, parentId);
    node.transform = decomposeTransform(multiply(invert(parentWorld), world));
    node.parentId = parentId;
  }
  const from = nodeIndex(doc, id);
  const [moved] = doc.nodes.splice(from, 1);
  let to = index;
  if (to === undefined) {
    const siblings = doc.nodes
      .map((candidate, i) => ({ candidate, i }))
      .filter(({ candidate }) => candidate.parentId === parentId);
    to = siblings.length
      ? siblings.at(-1)!.i + 1
      : parentId === null
        ? doc.nodes.length
        : nodeIndex(doc, parentId) + 1;
  } else if (from < to) to -= 1;
  doc.nodes.splice(Math.max(0, Math.min(to, doc.nodes.length)), 0, moved!);
  return true;
}

/**
 * Wraps nodes in a new group placed at their common parent, centred on `pivot` (in the
 * parent's space; defaults to the origin of the parent). World transforms are preserved.
 */
export function groupNodes(
  doc: GalbeDocument,
  ids: string[],
  options: { name?: string; pivot?: [number, number, number] } = {},
): string | null {
  const top = topLevelIds(doc, ids);
  if (!top.length) return null;
  const parents = new Set(top.map((id) => findNode(doc, id)!.parentId));
  const parentId = parents.size === 1 ? [...parents][0]! : null;
  const group = createGroupNode({
    name: options.name ?? 'Group',
    parentId,
    transform: { position: options.pivot ?? [0, 0, 0] },
  });
  const insertAt = Math.max(...top.map((id) => nodeIndex(doc, id))) + 1;
  doc.nodes.splice(insertAt, 0, group);
  // Keep the children's relative order.
  for (const id of top) reparentNode(doc, id, group.id);
  return group.id;
}

/** Dissolves groups, moving their children to the group's parent. Returns the children. */
export function ungroupNodes(doc: GalbeDocument, groupIds: string[]): string[] {
  const released: string[] = [];
  for (const groupId of groupIds) {
    const group = findNode(doc, groupId);
    if (group?.type !== 'group') continue;
    const children = childrenOf(doc, groupId);
    for (const child of children) {
      reparentNode(doc, child.id, group.parentId, nodeIndex(doc, groupId));
      released.push(child.id);
    }
    doc.nodes = doc.nodes.filter((node) => node.id !== groupId);
  }
  return released;
}

export function touch(doc: GalbeDocument, now = new Date()): void {
  doc.updatedAt = now.toISOString();
}
