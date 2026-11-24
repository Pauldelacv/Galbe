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
/**
 * Returns a URL for a higher-resolution version of a builtin HDRI (`2k`, `4k`), or null
 * when there is none. Hosts implement downloading and caching.
 */
export type HdriVariantResolver = (
  uri: AssetUri,
  resolution: Environment['resolution'],
) => Promise<string | null>;

export class EnvironmentController {
  private readonly textures = new Map<string, Promise<Texture | null>>();
  private readonly loaded = new Map<string, Texture | null>();
  private current: string | null = null;
  private shown: Texture | null = null;
  private readonly backgroundColor = new Color();

  constructor(
    private readonly source: AssetSource,
    private readonly onChange: () => void,
    private readonly variants?: HdriVariantResolver,
  ) {}

  /** True while the requested HDRI is still loading. */
  get pending(): boolean {
    return this.current !== null && !this.loaded.has(this.current);
  }

  private keyOf(environment: Environment): string | null {
    if (!environment.hdri) return null;
    const variant =
      this.variants && environment.resolution !== '1k' && environment.hdri.startsWith('builtin:');
    return variant ? `${environment.hdri}@${environment.resolution}` : environment.hdri;
  }

  apply(scene: Scene, environment: Environment, background: Background): void {
    const key = this.keyOf(environment);
    this.current = key;
    let texture: Texture | null = null;
    if (key && environment.hdri) {
      texture = this.texture(key, environment);
      // While a sharper variant downloads, keep showing the bundled one (or the last one).
      if (!texture && key !== environment.hdri)
        texture = this.texture(environment.hdri, environment);
      if (!texture && this.shown && this.loaded.has(key) === false) texture = this.shown;
    }
    this.shown = texture;

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
      default:
        // Gradients, images and videos are drawn by the BackgroundLayer.
        scene.background = null;
    }
  }

  /** Resolves once the HDRI is loaded (or failed). Useful before exporting. */
  async ready(environment: Environment): Promise<void> {
    const key = this.keyOf(environment);
    if (key) await this.load(key, environment);
  }

  private texture(key: string, environment: Environment): Texture | null {
    if (this.loaded.has(key)) return this.loaded.get(key) ?? null;
    void this.load(key, environment);
    return null;
  }

  private resolve(key: string, environment: Environment): Promise<string> {
    const uri = environment.hdri!;
    if (key === uri || !this.variants) return this.source.resolveUrl(uri);
    return this.variants(uri, environment.resolution).then(
      (url) => url ?? this.source.resolveUrl(uri),
      () => this.source.resolveUrl(uri),
    );
  }

  private load(key: string, environment: Environment): Promise<Texture | null> {
    const uri = key;
    let promise = this.textures.get(key);
    if (!promise) {
      promise = this.resolve(key, environment)
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
          this.loaded.set(key, texture);
          this.onChange();
          return texture;
        });
      this.textures.set(key, promise);
    }
    return promise;
  }

  dispose(): void {
    for (const texture of this.loaded.values()) texture?.dispose();
    this.loaded.clear();
    this.textures.clear();
  }
}
