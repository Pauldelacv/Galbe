import { builtinFilePath } from '@galbe/assets';
import { type AssetUri, parseAssetUri } from '@galbe/core';

/**
 * Where the engine gets bytes from. Hosts implement it: the studio reads project assets
 * from IndexedDB, the player from the unpacked `.galbe`, tests from disk.
 */
export interface AssetSource {
  /** A URL a loader can fetch (object URL for project assets). */
  resolveUrl(uri: AssetUri): Promise<string>;
  fetchBytes(uri: AssetUri): Promise<ArrayBuffer>;
}

export interface UrlAssetSourceOptions {
  /** Base URL where `@galbe/assets/files` is served, ending with `/` (e.g. `/builtin/`). */
  builtinBaseUrl: string;
  /** Returns a project asset's content. */
  getProjectAsset: (id: string) => Promise<Blob | undefined>;
}

export class AssetNotFoundError extends Error {
  constructor(readonly uri: string) {
    super(`Asset not found: ${uri}`);
    this.name = 'AssetNotFoundError';
  }
}

/** Default browser implementation: builtins over HTTP, project assets as object URLs. */
export function createUrlAssetSource({
  builtinBaseUrl,
  getProjectAsset,
}: UrlAssetSourceOptions): AssetSource & {
  dispose(): void;
} {
  const objectUrls = new Map<string, Promise<string>>();

  const resolveUrl = (uri: AssetUri): Promise<string> => {
    const parsed = parseAssetUri(uri);
    if (!parsed) return Promise.reject(new AssetNotFoundError(uri));
    if (parsed.scheme === 'builtin') {
      const file = builtinFilePath(parsed.id);
      return file
        ? Promise.resolve(builtinBaseUrl + file)
        : Promise.reject(new AssetNotFoundError(uri));
    }
    let url = objectUrls.get(parsed.id);
    if (!url) {
      url = getProjectAsset(parsed.id).then((blob) => {
        if (!blob) {
          objectUrls.delete(parsed.id);
          throw new AssetNotFoundError(uri);
        }
        return URL.createObjectURL(blob);
      });
      objectUrls.set(parsed.id, url);
    }
    return url;
  };

  return {
    resolveUrl,
    async fetchBytes(uri) {
      const response = await fetch(await resolveUrl(uri));
      if (!response.ok) throw new AssetNotFoundError(uri);
      return response.arrayBuffer();
    },
    dispose() {
      for (const url of objectUrls.values()) url.then(URL.revokeObjectURL, () => {});
      objectUrls.clear();
    },
  };
}
