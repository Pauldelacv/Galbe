import type { Camera as CameraSpec, RenderSettings } from '@galbe/core';
import {
  ACESFilmicToneMapping,
  AgXToneMapping,
  NeutralToneMapping,
  NoToneMapping,
  type PerspectiveCamera,
  SRGBColorSpace,
  type ToneMapping,
  type WebGLRenderer,
} from 'three';

const TONE_MAPPING: Record<RenderSettings['toneMapping'], ToneMapping> = {
  neutral: NeutralToneMapping,
  agx: AgXToneMapping,
  aces: ACESFilmicToneMapping,
  none: NoToneMapping,
};

export function applyRenderSettings(renderer: WebGLRenderer, settings: RenderSettings): void {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[settings.toneMapping];
  renderer.toneMappingExposure = settings.exposure;
}

/** Applies a document camera to a perspective camera (aspect is the host's). */
export function applyCameraSpec(
  camera: PerspectiveCamera,
  spec: CameraSpec,
  aspect?: number,
): void {
  camera.fov = spec.fov;
  camera.near = spec.near;
  camera.far = spec.far;
  if (aspect) camera.aspect = aspect;
  camera.position.set(...spec.position);
  camera.lookAt(...spec.target);
  camera.updateProjectionMatrix();
}

/** 35 mm-equivalent focal length ↔ vertical field of view (24 mm sensor height). */
export const fovToFocalLength = (fov: number): number => 12 / Math.tan((fov * Math.PI) / 360);
export const focalLengthToFov = (mm: number): number => (2 * Math.atan(12 / mm) * 180) / Math.PI;
