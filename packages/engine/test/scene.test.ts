import {
  addNode,
  createGroupNode,
  createMaterial,
  createStarterDocument,
  type GalbeDocument,
  removeNodes,
} from '@galbe/core';
import { produce } from 'immer';
import { Mesh, type MeshPhysicalMaterial, Scene } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { focalLengthToFov, fovToFocalLength } from '../src/render.ts';
import { SceneController } from '../src/scene/SceneController.ts';
import { diskAssetSource } from './helpers.ts';

function starter(): GalbeDocument {
  return produce(createStarterDocument(), (draft) => {
    draft.environment.hdri = null; // no HDR loading in Node
  });
}

async function setup(doc = starter()) {
  const onChange = vi.fn();
  const controller = new SceneController({ assets: diskAssetSource, onChange });
  const scene = new Scene();
  controller.attach(scene);
  controller.sync(doc);
  await controller.whenReady();
  return { controller, scene, onChange, doc };
}

describe('SceneController', () => {
  it('builds a mesh per text node once its font has loaded', async () => {
    const { controller, onChange, doc } = await setup();
    expect(onChange).toHaveBeenCalled();
    const node = doc.nodes[0]!;
    const object = controller.objectOf(node.id)!;
    const mesh = object.children.find((child) => child instanceof Mesh) as Mesh;
    expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(100);
    expect(controller.nodeIdOf(mesh)).toBe(node.id);
    expect(controller.bounds()).not.toBeNull();
    expect(controller.status.loading).toBe(0);
  });

  it('applies material specs in place', async () => {
    const { controller, doc } = await setup();
    const node = doc.nodes[0]!;
    if (node.type !== 'text') throw new Error('expected text');
    const mesh = controller.objectOf(node.id)!.children[0] as Mesh;
    const material = mesh.material as MeshPhysicalMaterial;
    expect(material.metalness).toBe(1);
    const next = produce(doc, (draft) => {
      const m = draft.materials[node.materialId]!;
      if (m.type === 'physical') m.roughness = 0.7;
    });
    controller.sync(next);
    expect(mesh.material).toBe(material);
    expect(material.roughness).toBe(0.7);
  });

  it('rebuilds geometry only when geometry inputs change', async () => {
    const { controller, doc } = await setup();
    const id = doc.nodes[0]!.id;
    const mesh = controller.objectOf(id)!.children[0] as Mesh;
    const geometry = mesh.geometry;
    const moved = produce(doc, (draft) => {
      draft.nodes[0]!.transform.position = [1, 2, 3];
    });
    controller.sync(moved);
    expect(mesh.geometry).toBe(geometry);
    expect(controller.objectOf(id)!.position.toArray()).toEqual([1, 2, 3]);
    const retyped = produce(moved, (draft) => {
      const node = draft.nodes[0]!;
      if (node.type === 'text') node.text = 'Hello';
    });
    controller.sync(retyped);
    expect(mesh.geometry).not.toBe(geometry);
  });

  it('parents nodes, inherits visibility and removes deleted nodes', async () => {
    const base = starter();
    const group = createGroupNode();
    const doc = produce(base, (draft) => {
      addNode(draft, group);
      draft.nodes[0]!.parentId = group.id;
    });
    const { controller } = await setup(doc);
    const textId = doc.nodes[0]!.id;
    expect(controller.objectOf(textId)!.parent).toBe(controller.objectOf(group.id));
    const hidden = produce(doc, (draft) => {
      draft.nodes.find((node) => node.id === group.id)!.visible = false;
    });
    controller.sync(hidden);
    expect(controller.objectOf(textId)!.visible).toBe(false);
    const removed = produce(hidden, (draft) => removeNodes(draft, [group.id]));
    controller.sync(removed);
    expect(controller.objectOf(textId)).toBeUndefined();
    expect(controller.content.children).toHaveLength(0);
  });

  it('reports fonts that cannot be loaded', async () => {
    const material = createMaterial('chrome');
    const doc = produce(starter(), (draft) => {
      draft.materials[material.id] = material;
      const node = draft.nodes[0]!;
      if (node.type === 'text')
        node.font = {
          family: 'Missing',
          weight: 400,
          style: 'normal',
          files: ['builtin:fonts/nope/latin-400-normal'],
        };
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { controller } = await setup(doc);
    controller.sync(doc);
    expect(controller.status.errors.get(doc.nodes[0]!.id)).toMatch(/Missing/);
    warn.mockRestore();
  });
});

describe('camera helpers', () => {
  it('converts between focal length and field of view', () => {
    expect(fovToFocalLength(focalLengthToFov(50))).toBeCloseTo(50, 6);
    expect(focalLengthToFov(24)).toBeCloseTo(53.13, 1);
  });
});
