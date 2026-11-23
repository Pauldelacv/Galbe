import { createId } from './ids.ts';
import type { GalbeDocument } from './schema/document.ts';
import type { MaterialSpec } from './schema/material.ts';
import { isMeshNode, type SceneNode } from './schema/nodes.ts';

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
  const used = new Set(doc.nodes.filter(isMeshNode).map((node) => node.materialId));
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
      const material = doc.materials[copy.materialId];
      if (material) {
        const materialCopy = { ...structuredClone(material), id: createId() };
        doc.materials[materialCopy.id] = materialCopy;
        copy.materialId = materialCopy.id;
      }
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

export function touch(doc: GalbeDocument, now = new Date()): void {
  doc.updatedAt = now.toISOString();
}
