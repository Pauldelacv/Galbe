import type { AssetUri } from '@galbe/core';
import { type ColorSpace, NoColorSpace, SRGBColorSpace, type Texture, TextureLoader } from 'three';
import type { AssetSource } from '../assets/AssetSource.ts';

type Loader = (url: string) => Promise<Texture>;

/**
 * Loads image textures from asset URIs once, per colour space (the same file used as a
 * colour map and as a data map needs both). Loading is asynchronous: `get` returns null
 * until ready and `onChange` fires when a texture arrives.
 */
export class TextureLibrary {
  private readonly cache = new Map<string, Promise<Texture | null>>();
  private readonly ready = new Map<string, Texture | null>();
  private readonly loader: Loader;

  constructor(
    private readonly source: AssetSource,
    private readonly onChange: () => void,
    loader?: Loader,
  ) {
    this.loader = loader ?? ((url) => new TextureLoader().loadAsync(url));
  }

  get pending(): number {
    return this.cache.size - this.ready.size;
  }

  /** Routes some URIs (videos) to another provider; return undefined to load as an image. */
  external: ((uri: AssetUri) => Texture | null | undefined) | null = null;

  get(uri: AssetUri, colorSpace: ColorSpace = SRGBColorSpace): Texture | null {
    const external = this.external?.(uri);
    if (external !== undefined) return external;
    const key = `${uri}|${colorSpace}`;
    if (this.ready.has(key)) return this.ready.get(key) ?? null;
    void this.load(uri, colorSpace);
    return null;
  }

  failed(uri: AssetUri, colorSpace: ColorSpace = SRGBColorSpace): boolean {
    const key = `${uri}|${colorSpace}`;
    return this.ready.has(key) && this.ready.get(key) === null;
  }

  load(uri: AssetUri, colorSpace: ColorSpace = SRGBColorSpace): Promise<Texture | null> {
    const key = `${uri}|${colorSpace}`;
    let promise = this.cache.get(key);
    if (!promise) {
      promise = this.source
        .resolveUrl(uri)
        .then(this.loader)
        .then((texture) => {
          texture.colorSpace = colorSpace === SRGBColorSpace ? SRGBColorSpace : NoColorSpace;
          texture.anisotropy = 8;
          return texture;
        })
        .catch((error: unknown) => {
          console.warn(`[galbe] texture ${uri} failed to load`, error);
          return null;
        })
        .then((texture) => {
          this.ready.set(key, texture);
          this.onChange();
          return texture;
        });
      this.cache.set(key, promise);
    }
    return promise;
  }

  /** Resolves when every requested texture has settled. */
  async whenReady(): Promise<void> {
    while (this.pending > 0) await Promise.allSettled([...this.cache.values()]);
  }

  dispose(): void {
    for (const texture of this.ready.values()) texture?.dispose();
    this.ready.clear();
    this.cache.clear();
  }
}
