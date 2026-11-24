import { getBuiltinHdri } from '@galbe/assets';
import type { AssetUri, Environment } from '@galbe/core';
import { db } from '../../persistence/db.ts';
import { notify } from '../../state/toastStore.ts';

/** Poly Haven slug of a builtin HDRI, from its credit URL. */
const polyHavenSlug = (id: string): string | undefined =>
  getBuiltinHdri(id)?.credit.url.split('/').filter(Boolean).at(-1);

const inflight = new Map<string, Promise<string | null>>();

/**
 * Downloads (once) and caches a 2K/4K version of a builtin HDRI from Poly Haven (CC0), and
 * returns an object URL for it. The bundled 1K file stays visible meanwhile.
 */
export function resolveHdriVariant(
  uri: AssetUri,
  resolution: Environment['resolution'],
): Promise<string | null> {
  if (resolution === '1k' || !uri.startsWith('builtin:')) return Promise.resolve(null);
  const id = uri.slice('builtin:'.length);
  const slug = polyHavenSlug(id);
  if (!slug) return Promise.resolve(null);
  const key = `hdri:${slug}@${resolution}`;
  let promise = inflight.get(key);
  if (!promise) {
    promise = (async () => {
      const store = await db();
      const cached = await store.get('cache', key);
      if (cached) return URL.createObjectURL(cached.blob);
      notify(`Downloading the ${resolution.toUpperCase()} environment…`, 'info');
      const response = await fetch(
        `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${resolution}/${slug}_${resolution}.hdr`,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      await store.put('cache', { key, blob, createdAt: new Date().toISOString() });
      notify(`${resolution.toUpperCase()} environment ready`, 'success');
      return URL.createObjectURL(blob);
    })().catch((error: unknown) => {
      inflight.delete(key);
      notify(
        `Could not download the ${resolution.toUpperCase()} environment (${error instanceof Error ? error.message : 'network error'}). Using the bundled one.`,
        'error',
      );
      return null;
    });
    inflight.set(key, promise);
  }
  return promise;
}
