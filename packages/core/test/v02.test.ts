import { describe, expect, it } from 'vitest';
import {
  addNode,
  composeTransform,
  createEffect,
  createGroupNode,
  createMatcapMaterial,
  createMaterial,
  createModelNode,
  createPrimitiveNode,
  createShapeNode,
  createStarterDocument,
  decomposeTransform,
  duplicateNodes,
  EFFECT_DEFINITIONS,
  findNode,
  GalbeDocumentSchema,
  groupNodes,
  invert,
  loadDocument,
  multiply,
  nodeMaterialIds,
  removeNodes,
  reparentNode,
  resolveEffectParams,
  type Transform,
  transformPoint,
  ungroupNodes,
  worldMatrix,
} from '../src/index.ts';

const close = (a: number[], b: number[], eps = 1e-3) =>
  a.every((value, index) => Math.abs(value - b[index]!) < eps);

describe('transform math', () => {
  it('round-trips compose/decompose', () => {
    const t: Transform = { position: [1, -2, 3], rotation: [30, -45, 60], scale: [2, 2, 2] };
    const back = decomposeTransform(composeTransform(t));
    expect(close(back.position, t.position)).toBe(true);
    expect(close(back.rotation, t.rotation)).toBe(true);
    expect(close(back.scale, t.scale)).toBe(true);
  });

  it('inverts matrices', () => {
    const m = composeTransform({ position: [4, 5, 6], rotation: [10, 20, 30], scale: [1, 3, 2] });
    const id = multiply(m, invert(m));
    expect(close(id, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])).toBe(true);
    expect(close(transformPoint(m, [0, 0, 0]), [4, 5, 6])).toBe(true);
  });
});

function scene() {
  const doc = structuredClone(createStarterDocument());
  const material = createMaterial('gold');
  const sphere = createPrimitiveNode({
    kind: 'sphere',
    materialId: material.id,
    transform: { position: [2, 0, 0], rotation: [0, 45, 0] },
  });
  addNode(doc, sphere, { materials: [material] });
  return { doc, text: doc.nodes[0]!, sphere };
}

describe('grouping', () => {
  it('groups and ungroups preserving world transforms', () => {
    const { doc, text, sphere } = scene();
    const before = worldMatrix(doc, sphere.id);
    const groupId = groupNodes(doc, [text.id, sphere.id], { pivot: [1, 1, 0] })!;
    expect(findNode(doc, sphere.id)!.parentId).toBe(groupId);
    expect(close(worldMatrix(doc, sphere.id), before)).toBe(true);
    // Moving the group moves both.
    findNode(doc, groupId)!.transform.position = [5, 1, 0];
    expect(worldMatrix(doc, sphere.id)[12]).toBeCloseTo(6);
    const after = worldMatrix(doc, sphere.id);
    const released = ungroupNodes(doc, [groupId]);
    expect(released.sort()).toEqual([text.id, sphere.id].sort());
    expect(findNode(doc, groupId)).toBeUndefined();
    expect(close(worldMatrix(doc, sphere.id), after)).toBe(true);
    expect(GalbeDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('refuses cycles when re-parenting', () => {
    const { doc } = scene();
    const outer = createGroupNode({ name: 'outer' });
    addNode(doc, outer);
    const inner = createGroupNode({ name: 'inner', parentId: outer.id });
    addNode(doc, inner);
    expect(reparentNode(doc, outer.id, inner.id)).toBe(false);
    expect(reparentNode(doc, inner.id, null)).toBe(true);
    expect(findNode(doc, inner.id)!.parentId).toBeNull();
  });
});

describe('v0.2 nodes and materials', () => {
  it('validates shapes with per-path materials, and duplicates them independently', () => {
    const doc = structuredClone(createStarterDocument());
    const base = createMaterial('glossy-plastic');
    const red = createMaterial('glossy-plastic', { color: '#ff0000' });
    const shape = createShapeNode({
      materialId: base.id,
      viewBox: [0, 0, 100, 100],
      paths: [
        { id: 'a', d: 'M0 0L100 0L100 100Z', materialId: red.id },
        { id: 'b', d: 'M0 0L50 0L50 50Z' },
      ],
    });
    addNode(doc, shape, { materials: [base, red] });
    expect(nodeMaterialIds(shape)).toEqual([base.id, red.id]);
    expect(GalbeDocumentSchema.safeParse(doc).success).toBe(true);

    const [copyId] = duplicateNodes(doc, [shape.id]);
    const copy = findNode(doc, copyId!);
    if (copy?.type !== 'shape') throw new Error('expected a shape');
    expect(copy.paths[0]!.materialId).not.toBe(red.id);
    expect(copy.paths[0]!.materialId! in doc.materials).toBe(true);

    removeNodes(doc, [shape.id]);
    expect(red.id in doc.materials).toBe(false);
    expect(copy.paths[0]!.materialId! in doc.materials).toBe(true);
  });

  it('rejects shapes whose path material is missing', () => {
    const doc = structuredClone(createStarterDocument());
    const base = createMaterial();
    addNode(
      doc,
      createShapeNode({
        materialId: base.id,
        viewBox: [0, 0, 1, 1],
        paths: [{ id: 'a', d: 'M0 0L1 0L1 1Z', materialId: 'nope' }],
      }),
      { materials: [base] },
    );
    expect(GalbeDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it('creates primitives, models and matcaps with defaults', () => {
    const material = createMatcapMaterial({ matcap: 'builtin:matcaps/clay-soft' });
    expect(material.type).toBe('matcap');
    const model = createModelNode({
      materialId: material.id,
      source: 'asset:0123456789abcdef0123456789abcdef',
      format: 'glb',
    });
    expect(model.fitSize).toBe(2);
    expect(createPrimitiveNode({ materialId: 'm' }).params.noise.seed).toBe(1);
  });

  it('loads v0.1 documents unchanged (additive schema)', () => {
    const v1 = JSON.parse(JSON.stringify(createStarterDocument()));
    delete v1.effects;
    delete v1.ground.reflection;
    delete v1.environment.resolution;
    for (const material of Object.values(v1.materials) as Record<string, unknown>[]) {
      delete material.textures;
      delete material.uv;
      delete material.holographic;
    }
    const doc = loadDocument(v1);
    expect(doc.effects).toEqual([]);
    expect(doc.ground.reflection.enabled).toBe(false);
    expect(doc.environment.resolution).toBe('1k');
  });
});

describe('effects', () => {
  it('creates every built-in effect with valid defaults', () => {
    for (const definition of EFFECT_DEFINITIONS) {
      const effect = createEffect(definition.type);
      expect(Object.keys(effect.params).sort()).toEqual(Object.keys(definition.params).sort());
    }
  });

  it('coerces params into their definition', () => {
    const params = resolveEffectParams({
      type: 'dither',
      params: { levels: 99.7, palette: 'bogus', dark: '#ABCDEF', extra: 1 },
    });
    expect(params.levels).toBe(16);
    expect(params.palette).toBe('duotone');
    expect(params.dark).toBe('#abcdef');
    expect('extra' in params).toBe(false);
  });

  it('keeps unknown effect types (plugins, newer files)', () => {
    const doc = structuredClone(createStarterDocument());
    doc.effects.push({ id: 'x', type: 'my-plugin', enabled: true, params: { a: 1 } });
    expect(GalbeDocumentSchema.parse(doc).effects[0]!.params).toEqual({ a: 1 });
  });
});
