import { createUrlAssetSource, type PostStack, SceneController } from '@galbe/engine';
import type { Camera, Scene, WebGLRenderer } from 'three';
import { create } from 'zustand';
import { resolveHdriVariant } from '../features/environment/hdriVariants.ts';
import { getAssetBlob } from '../persistence/assetStore.ts';

/** Base URL of the builtin assets (fonts, HDRIs) shipped with the studio. */
export const BUILTIN_BASE_URL = new URL('builtin/', document.baseURI).href;

export const assetSource = createUrlAssetSource({
  builtinBaseUrl: BUILTIN_BASE_URL,
  getProjectAsset: getAssetBlob,
});

interface EngineStatus {
  /** True once the viewport synced the document at least once. */
  synced: boolean;
  loading: number;
  errors: Record<string, string>;
}

/** Reactive mirror of the controller's status for the UI. */
export const useEngineStatus = create<EngineStatus>()(() => ({
  synced: false,
  loading: 0,
  errors: {},
}));

let invalidate: () => void = () => {};

export function publishStatus(): void {
  const { loading, errors } = controller.status;
  const current = useEngineStatus.getState();
  const nextErrors = Object.fromEntries(errors);
  if (
    !current.synced ||
    current.loading !== loading ||
    JSON.stringify(current.errors) !== JSON.stringify(nextErrors)
  ) {
    useEngineStatus.setState({ synced: true, loading, errors: nextErrors });
  }
}

/** The single engine instance driving the viewport, exports and thumbnails. */
export const controller = new SceneController({
  assets: assetSource,
  hdriVariants: resolveHdriVariant,
  onChange: () => {
    publishStatus();
    invalidate();
  },
});

/** Live handles on the viewport's renderer, scene and camera (set by the viewport). */
export const viewport: {
  gl: WebGLRenderer | null;
  scene: Scene | null;
  camera: Camera | null;
  /** Post-processing stack bound to the viewport renderer. */
  post: PostStack | null;
} = {
  gl: null,
  scene: null,
  camera: null,
  post: null,
};

export function setInvalidate(fn: () => void): void {
  invalidate = fn;
}

export function requestRender(): void {
  invalidate();
}

/** Debug / end-to-end testing handle (no API guarantees). */
(globalThis as Record<string, unknown>).__galbe = { viewport, controller };
