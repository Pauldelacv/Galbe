import type { FontRef, Overlay } from '@galbe/core';
import type { Size } from '../image/tiles.ts';

/** The parts of a 2D context overlays use (a canvas or OffscreenCanvas context). */
export type OverlayContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'translate'
  | 'rotate'
  | 'fillText'
  | 'font'
  | 'fillStyle'
  | 'globalAlpha'
  | 'textAlign'
  | 'textBaseline'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetY'
> & { letterSpacing?: string };

/** Resolves a font reference to a CSS `font-family` list, already quoted (null while it loads). */
export type OverlayFontResolver = (font: FontRef) => string | null;

export interface OverlayLine {
  text: string;
  /** Baseline offset from the anchor, in pixels (the block is centred on the anchor). */
  y: number;
}

/** Splits an overlay into lines centred vertically on its anchor. */
export function layoutOverlay(
  overlay: Overlay,
  frameHeight: number,
): { px: number; lines: OverlayLine[] } {
  const px = overlay.size * frameHeight;
  const text = overlay.uppercase ? overlay.text.toUpperCase() : overlay.text;
  const rows = text.split('\n');
  const step = overlay.lineHeight * px;
  return {
    px,
    lines: rows.map((row, i) => ({ text: row, y: (i - (rows.length - 1) / 2) * step })),
  };
}

/**
 * Draws Cover text overlays over a composed frame. The same function draws the studio's
 * viewport overlay and every exported image or video frame, so they always match.
 */
export function drawOverlays(
  context: OverlayContext,
  overlays: readonly Overlay[],
  size: Size,
  fonts: OverlayFontResolver,
): void {
  for (const overlay of overlays) {
    if (!overlay.visible || overlay.opacity <= 0 || !overlay.text.trim()) continue;
    const family = fonts(overlay.font);
    const { px, lines } = layoutOverlay(overlay, size.height);
    context.save();
    context.translate(overlay.position[0] * size.width, overlay.position[1] * size.height);
    if (overlay.rotation) context.rotate((overlay.rotation * Math.PI) / 180);
    context.globalAlpha = overlay.opacity;
    context.fillStyle = overlay.color;
    context.font = `${overlay.font.style === 'italic' ? 'italic ' : ''}${overlay.font.weight} ${px}px ${family ? `${family}, ` : ''}sans-serif`;
    if ('letterSpacing' in context) context.letterSpacing = `${overlay.letterSpacing * px}px`;
    context.textAlign = overlay.align;
    context.textBaseline = 'middle';
    if (overlay.shadow > 0) {
      context.shadowColor = `rgba(0, 0, 0, ${0.6 * overlay.shadow})`;
      context.shadowBlur = px * 0.3 * overlay.shadow;
      context.shadowOffsetY = px * 0.05 * overlay.shadow;
    }
    for (const line of lines) context.fillText(line.text, 0, line.y);
    context.restore();
  }
}
