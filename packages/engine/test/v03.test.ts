import {
  createMotion,
  createStarterDocument,
  type GalbeDocument,
  loadDocument,
  setKeyframe,
} from '@galbe/core';
import { produce } from 'immer';
import { Mesh, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { mediaUvScale } from '../src/background/BackgroundLayer.ts';
import { clipTime } from '../src/media/VideoLibrary.ts';
import { SceneController } from '../src/scene/SceneController.ts';
import { diskAssetSource } from './helpers.ts';

function starter(): GalbeDocument {
  return produce(createStarterDocument(), (draft) => {
    draft.environment.hdri = null;
  });
}

async function setup(doc: GalbeDocument) {
  const controller = new SceneController({ assets: diskAssetSource });
  const scene = new Scene();
  controller.attach(scene);
  controller.syncAt(doc, 0);
  await controller.whenReady();
  controller.syncAt(doc, 0);
  return { controller, scene };
}

const meshOf = (controller: SceneController, id: string) =>
  controller.objectOf(id)!.children.find((child) => child instanceof Mesh) as Mesh;

describe('animation in the engine', () => {
  it('applies keyframes and motions at the requested time', async () => {
    const doc = produce(starter(), (draft) => {
      const id = draft.nodes[0]!.id;
      setKeyframe(draft.animation, `nodes.${id}.transform.position.0`, 0, 0, 'linear');
      setKeyframe(draft.animation, `nodes.${id}.transform.position.0`, 4, 2, 'linear');
      draft.animation.motions.push(createMotion('spin', { nodeId: id }));
    });
    const { controller } = await setup(doc);
    const object = controller.objectOf(doc.nodes[0]!.id)!;
    controller.syncAt(doc, 2);
    expect(object.position.x).toBeCloseTo(1);
    expect(object.rotation.y).toBeCloseTo(Math.PI);
    controller.syncAt(doc, 0);
    expect(object.position.x).toBe(0);
  });

  it('moves letters for a reveal and restores the rest pose', async () => {
    const doc = produce(starter(), (draft) => {
      draft.animation.motions.push(createMotion('reveal', { nodeId: draft.nodes[0]!.id }));
    });
    const { controller } = await setup(doc);
    const id = doc.nodes[0]!.id;
    const positions = () =>
      Array.from(meshOf(controller, id).geometry.getAttribute('position').array);
    controller.syncAt(doc, 4);
    const atEnd = positions();
    controller.syncAt(doc, 0);
    const atStart = positions();
    // Hidden letters collapse to their centres.
    expect(atStart).not.toEqual(atEnd);
    const still = produce(doc, (draft) => {
      draft.animation.motions = [];
    });
    controller.syncAt(still, 0);
    expect(positions()).toEqual(atEnd);
  });

  it('keeps the ground where the rest pose puts it', async () => {
    const doc = produce(starter(), (draft) => {
      draft.animation.motions.push(
        createMotion('float', { nodeId: draft.nodes[0]!.id, amplitude: 1 }),
      );
    });
    const { controller } = await setup(doc);
    const y0 = controller.contactShadows.object.position.y;
    controller.syncAt(doc, 1);
    expect(controller.objectOf(doc.nodes[0]!.id)!.position.y).toBeCloseTo(1);
    expect(controller.contactShadows.object.position.y).toBe(y0);
  });

  it('activates the background layer for gradients', async () => {
    const doc = loadDocument({ ...starter(), background: { type: 'gradient', kind: 'radial' } });
    const { controller, scene } = await setup(doc);
    expect(controller.background.active).toBe(true);
    expect(controller.background.mesh.visible).toBe(true);
    expect(scene.background).toBeNull();
    controller.syncAt(starter(), 0);
    expect(controller.background.active).toBe(false);
  });
});

describe('media helpers', () => {
  it('fits media like CSS object-fit', () => {
    // Wide image in a square frame: cover crops the sides, contain letterboxes.
    expect(mediaUvScale('cover', 1, 2)).toEqual([0.5, 1]);
    expect(mediaUvScale('contain', 1, 2)).toEqual([1, 2]);
    expect(mediaUvScale('stretch', 1, 2, 2)).toEqual([0.5, 0.5]);
  });

  it('maps timeline time to clip time', () => {
    expect(clipTime(3, 2)).toBeCloseTo(1);
    expect(clipTime(3, 2, { loop: false })).toBeCloseTo(1.999);
    expect(clipTime(1, 10, { startAt: 2, speed: 2 })).toBe(4);
  });
});

describe('geometry worker', () => {
  /** A client and a server talking through in-process queues (like a real worker). */
  function inProcessWorker() {
    type Listener = (event: { data: unknown }) => void;
    const toServer: Listener[] = [];
    const toClient: Listener[] = [];
    const worker = {
      postMessage: (data: unknown) => queueMicrotask(() => toServer.forEach((l) => l({ data }))),
      addEventListener: (type: string, listener: Listener) => {
        if (type === 'message') toClient.push(listener);
      },
    };
    const scope = {
      postMessage: (data: unknown) => queueMicrotask(() => toClient.forEach((l) => l({ data }))),
      addEventListener: (_type: string, listener: Listener) => toServer.push(listener),
    };
    return { worker, scope };
  }

  it('builds the same text and shapes off the main thread', async () => {
    const { GeometryWorkerClient } = await import('../src/worker/GeometryWorkerClient.ts');
    const { serveGeometry } = await import('../src/worker/serveGeometry.ts');
    const { worker, scope } = inProcessWorker();
    serveGeometry(scope as never, () => diskAssetSource);
    const client = new GeometryWorkerClient(worker as never, '/builtin/');
    const doc = produce(starter(), (draft) => {
      draft.animation.motions.push(createMotion('wave', { nodeId: draft.nodes[0]!.id }));
    });
    const sync = await setup(doc);
    const threaded = new SceneController({ assets: diskAssetSource, geometry: client });
    threaded.attach(new Scene());
    threaded.syncAt(doc, 1);
    await threaded.whenReady();
    sync.controller.syncAt(doc, 1);
    const id = doc.nodes[0]!.id;
    const a = meshOf(sync.controller, id).geometry.getAttribute('position').array;
    const b = meshOf(threaded, id).geometry.getAttribute('position').array;
    expect(b.length).toBeGreaterThan(100);
    // Same geometry, and the per-letter wave was applied after the async build.
    expect(Array.from(b)).toEqual(Array.from(a));
    expect(threaded.status.loading).toBe(0);
  });
});
