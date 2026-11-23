import { describe, expect, it } from 'vitest';
import {
  addNode,
  assignMaterial,
  createGroupNode,
  createMaterial,
  createStarterDocument,
  createTextNode,
  duplicateNodes,
  GalbeDocumentSchema,
  isEffectivelyVisible,
  removeNodes,
  reorderNode,
  withDescendants,
} from '../src/index.ts';

function setup() {
  const doc = structuredClone(createStarterDocument());
  const group = createGroupNode({ name: 'Group' });
  addNode(doc, group);
  const material = createMaterial('gold');
  const child = createTextNode({ text: 'child', materialId: material.id, parentId: group.id });
  addNode(doc, child, { materials: [material] });
  return { doc, group, child, text: doc.nodes[0]! };
}

describe('ops', () => {
  it('adds nodes with their materials', () => {
    const { doc, child } = setup();
    expect(doc.nodes).toHaveLength(3);
    expect(child.type === 'text' && doc.materials[child.materialId]?.preset).toBe('gold');
    expect(GalbeDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('removes descendants and prunes unused materials', () => {
    const { doc, group, text } = setup();
    expect(withDescendants(doc, [group.id]).size).toBe(2);
    removeNodes(doc, [group.id]);
    expect(doc.nodes.map((node) => node.id)).toEqual([text.id]);
    expect(Object.keys(doc.materials)).toHaveLength(1);
  });

  it('duplicates with fresh ids and independent materials', () => {
    const { doc, group } = setup();
    const [copyId] = duplicateNodes(doc, [group.id]);
    expect(doc.nodes).toHaveLength(5);
    const copy = doc.nodes.find((node) => node.id === copyId)!;
    expect(copy.name).toBe('Group copy');
    const copyChild = doc.nodes.find((node) => node.parentId === copyId)!;
    const originalChild = doc.nodes.find((node) => node.parentId === group.id)!;
    expect(copyChild.type === 'text' && originalChild.type === 'text').toBe(true);
    if (copyChild.type === 'text' && originalChild.type === 'text') {
      expect(copyChild.materialId).not.toBe(originalChild.materialId);
    }
    expect(GalbeDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('reorders nodes', () => {
    const { doc, text } = setup();
    reorderNode(doc, text.id, 99);
    expect(doc.nodes.at(-1)?.id).toBe(text.id);
    reorderNode(doc, text.id, 0);
    expect(doc.nodes[0]?.id).toBe(text.id);
  });

  it('computes inherited visibility', () => {
    const { doc, group, child } = setup();
    expect(isEffectivelyVisible(doc, child.id)).toBe(true);
    doc.nodes.find((node) => node.id === group.id)!.visible = false;
    expect(isEffectivelyVisible(doc, child.id)).toBe(false);
  });

  it('assigns a material spec while keeping the id', () => {
    const { doc, text } = setup();
    const before = text.type === 'text' ? text.materialId : '';
    const { id: _ignored, ...glass } = createMaterial('glass');
    assignMaterial(doc, text.id, glass);
    expect(doc.materials[before]?.transmission).toBe(1);
  });
});
