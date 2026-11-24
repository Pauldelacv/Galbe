import type { AssetUri, ModelFormat } from '@galbe/core';
import { Box3, Mesh, type Object3D } from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AssetSource } from '../assets/AssetSource.ts';

export interface LoadedModel {
  /** Template scene; hosts clone it per node. */
  scene: Object3D;
  /** Bounds of the template in its own space. */
  bounds: Box3;
  meshCount: number;
  triangleCount: number;
}

/** Parses model bytes. Loaders are imported lazily: they are large and rarely all needed. */
export async function parseModel(bytes: ArrayBuffer, format: ModelFormat): Promise<Object3D> {
  switch (format) {
    case 'glb':
    case 'gltf': {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const data = format === 'gltf' ? new TextDecoder().decode(bytes) : bytes;
      const gltf = await new GLTFLoader().parseAsync(data, '');
      return gltf.scene;
    }
    case 'fbx': {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      return new FBXLoader().parse(bytes, '');
    }
    case 'obj': {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      return new OBJLoader().parse(new TextDecoder().decode(bytes));
    }
  }
}

export function describeModel(scene: Object3D): LoadedModel {
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene, true);
  let meshCount = 0;
  let triangleCount = 0;
  scene.traverse((object) => {
    if (object instanceof Mesh) {
      meshCount++;
      const geometry = object.geometry;
      const count = geometry.index
        ? geometry.index.count
        : (geometry.getAttribute('position')?.count ?? 0);
      triangleCount += Math.floor(count / 3);
      geometry.computeBoundingBox();
    }
  });
  return { scene, bounds, meshCount, triangleCount };
}

/** Loads and caches models per asset URI. */
export class ModelLibrary {
  private readonly cache = new Map<AssetUri, Promise<LoadedModel | null>>();
  private readonly ready = new Map<AssetUri, LoadedModel | null>();
  private readonly errors = new Map<AssetUri, string>();

  constructor(private readonly source: AssetSource) {}

  get(uri: AssetUri): LoadedModel | null | undefined {
    return this.ready.get(uri);
  }

  error(uri: AssetUri): string | undefined {
    return this.errors.get(uri);
  }

  load(uri: AssetUri, format: ModelFormat): Promise<LoadedModel | null> {
    let promise = this.cache.get(uri);
    if (!promise) {
      promise = this.source
        .fetchBytes(uri)
        .then((bytes) => parseModel(bytes, format))
        .then(describeModel)
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          this.errors.set(uri, `Model could not be loaded: ${message}`);
          console.warn(`[galbe] model ${uri} failed to load`, error);
          return null;
        })
        .then((model) => {
          this.ready.set(uri, model);
          return model;
        });
      this.cache.set(uri, promise);
    }
    return promise;
  }

  dispose(): void {
    for (const model of this.ready.values()) {
      model?.scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) material.dispose();
        }
      });
    }
    this.ready.clear();
    this.cache.clear();
  }
}

/** Clones a model template for one node (skinned meshes keep working). */
export function cloneModel(scene: Object3D): Object3D {
  let skinned = false;
  scene.traverse((object) => {
    if ((object as { isSkinnedMesh?: boolean }).isSkinnedMesh) skinned = true;
  });
  return skinned ? skeletonClone(scene) : scene.clone(true);
}
