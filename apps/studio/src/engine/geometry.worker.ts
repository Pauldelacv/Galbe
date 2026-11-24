/// <reference lib="webworker" />
import { createUrlAssetSource, serveGeometry, type WorkerScopeLike } from '@galbe/engine/worker';
import { getAssetBlob } from '../persistence/assetStore.ts';

// Text and shape geometry, built off the main thread. Project fonts are read straight from
// IndexedDB (available in workers), builtin ones over HTTP.
serveGeometry(self as unknown as WorkerScopeLike, (builtinBaseUrl) =>
  createUrlAssetSource({ builtinBaseUrl, getProjectAsset: getAssetBlob }),
);
