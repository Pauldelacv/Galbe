import type { EvaluatedScene, GalbeDocument } from '@galbe/core';
import { applyRenderSettings } from '@galbe/engine';
import { controller, viewport } from './studioEngine.ts';

/**
 * Shows `doc` at timeline time `t` in the viewport renderer: evaluates and syncs the
 * scene, then the render settings and effect stack of that frame. Used by the viewport,
 * and by exports for every frame (deterministic stepping).
 */
export function showFrame(doc: GalbeDocument, time: number): EvaluatedScene {
  const evaluated = controller.syncAt(doc, time);
  const shown = evaluated.doc;
  if (viewport.gl) applyRenderSettings(viewport.gl, shown.render);
  const [px, py, pz] = shown.camera.position;
  const [tx, ty, tz] = shown.camera.target;
  viewport.post?.sync(shown.effects, {
    frameHeight: shown.frame.height,
    render: shown.render,
    context: {
      focusDistance: Math.hypot(px - tx, py - ty, pz - tz),
      lut: (uri) => controller.luts.get(uri),
    },
  });
  return evaluated;
}

let refresh: () => void = () => {};
/** Re-shows the document at the playhead (after an export moved the scene). */
export const refreshViewport = (): void => refresh();
export const setViewportRefresh = (fn: () => void): void => {
  refresh = fn;
};
