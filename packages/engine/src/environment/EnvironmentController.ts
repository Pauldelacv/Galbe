import type { AssetUri, Background, Environment } from '@galbe/core';
import {
  Color,
  type DataTexture,
  EquirectangularReflectionMapping,
  type Scene,
  type Texture,
} from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { AssetSource } from '../assets/AssetSource.ts';

const DEG = Math.PI / 180;

/**
 * Image-based lighting and background. three.js converts the equirectangular texture to a
 * PMREM internally and caches it, and exposes rotation, intensity and blurriness on the
 * scene, so changing those never re-filters the HDRI.
 */
export class EnvironmentController {
  private readonly textures = new Map<AssetUri, Promise<Texture | null>>();
  private readonly loaded = new Map<AssetUri, Texture | null>();
  private current: AssetUri | null = null;
  private readonly backgroundColor = new Color();

  constructor(
    private readonly source: AssetSource,
    private readonly onChange: () => void,
  ) {}

  /** True while the requested HDRI is still loading. */
  get pending(): boolean {
    return this.current !== null && !this.loaded.has(this.current);
  }

  apply(scene: Scene, environment: Environment, background: Background): void {
    this.current = environment.hdri;
    const texture = environment.hdri ? this.texture(environment.hdri) : null;

    scene.environment = texture;
    scene.environmentIntensity = environment.intensity;
    scene.environmentRotation.set(0, environment.rotation * DEG, 0);
    scene.backgroundRotation.set(0, environment.rotation * DEG, 0);

    switch (background.type) {
      case 'transparent':
        scene.background = null;
        break;
      case 'color':
        scene.background = this.backgroundColor.set(background.color);
        break;
      case 'environment':
        scene.background = texture;
        scene.backgroundBlurriness = background.blur;
        scene.backgroundIntensity = background.intensity;
        break;
    }
  }

  /** Resolves once the HDRI is loaded (or failed). Useful before exporting. */
  async ready(uri: AssetUri | null): Promise<void> {
    if (uri) await this.load(uri);
  }

  private texture(uri: AssetUri): Texture | null {
    if (this.loaded.has(uri)) return this.loaded.get(uri) ?? null;
    void this.load(uri);
    return null;
  }

  private load(uri: AssetUri): Promise<Texture | null> {
    let promise = this.textures.get(uri);
    if (!promise) {
      promise = this.source
        .resolveUrl(uri)
        .then((url) => new HDRLoader().loadAsync(url))
        .then((texture: DataTexture) => {
          texture.mapping = EquirectangularReflectionMapping;
          return texture as Texture;
        })
        .catch((error: unknown) => {
          console.warn(`[galbe] HDRI ${uri} failed to load`, error);
          return null;
        })
        .then((texture) => {
          this.loaded.set(uri, texture);
          if (uri === this.current) this.onChange();
          return texture;
        });
      this.textures.set(uri, promise);
    }
    return promise;
  }

  dispose(): void {
    for (const texture of this.loaded.values()) texture?.dispose();
    this.loaded.clear();
    this.textures.clear();
  }
}
