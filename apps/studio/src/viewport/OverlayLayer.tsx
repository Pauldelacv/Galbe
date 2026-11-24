import type { Frame, Overlay } from '@galbe/core';
import { drawOverlays, layoutOverlay } from '@galbe/exporters';
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react';
import { useEvaluatedStore } from '../engine/evaluatedStore.ts';
import { updateOverlay } from '../features/cover/CoverInspector.tsx';
import { overlayFontFamily, useOverlayFonts } from '../features/cover/overlayFonts.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { gesture, useUiStore } from '../state/uiStore.ts';
import styles from './Overlays.module.css';

interface Box {
  id: string;
  /** CSS pixels inside the frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/** Measures an overlay's block in frame pixels (for drag handles). */
function measure(
  context: CanvasRenderingContext2D,
  overlay: Overlay,
  frame: Frame,
): { width: number; height: number; left: number } {
  const { px, lines } = layoutOverlay(overlay, frame.height);
  const family = overlayFontFamily(overlay.font);
  context.font = `${overlay.font.style === 'italic' ? 'italic ' : ''}${overlay.font.weight} ${px}px ${family ? `${family}, ` : ''}sans-serif`;
  if ('letterSpacing' in context) context.letterSpacing = `${overlay.letterSpacing * px}px`;
  const width = Math.max(...lines.map((line) => context.measureText(line.text).width), px * 0.5);
  const height = (lines.length - 1) * overlay.lineHeight * px + px * 1.2;
  const left = overlay.align === 'left' ? 0 : overlay.align === 'right' ? -width : -width / 2;
  return { width, height, left };
}

/**
 * Cover overlays drawn over the 3D canvas with the exporter's own drawing code (so the
 * viewport matches exports), plus drag handles while the Cover tab is open.
 */
export function OverlayLayer({ width, height }: { width: number; height: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const evaluated = useEvaluatedStore((state) => state.doc);
  const base = useDocumentStore((state) => state.doc);
  const fontsVersion = useOverlayFonts((state) => state.version);
  const editing = useUiStore((state) => state.inspectorTab === 'cover');
  const activeId = useUiStore((state) => state.activeOverlay);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const overlays = (evaluated ?? base).overlays;
  const frame = base.frame;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw when fonts arrive
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / frame.width;
    context.setTransform(scale, 0, 0, scale, 0, 0);
    drawOverlays(context, overlays, frame, overlayFontFamily);
    if (!editing) return;
    const cssScale = width / frame.width;
    setBoxes(
      overlays
        .filter((overlay) => overlay.visible)
        .map((overlay) => {
          const box = measure(context, overlay, frame);
          return {
            id: overlay.id,
            x: (overlay.position[0] * frame.width + box.left) * cssScale,
            y: (overlay.position[1] * frame.height - box.height / 2) * cssScale,
            width: box.width * cssScale,
            height: box.height * cssScale,
            rotation: overlay.rotation,
          };
        }),
    );
  }, [overlays, frame, width, height, dpr, editing, fontsVersion]);

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>, id: string) => {
    event.stopPropagation();
    event.preventDefault();
    useUiStore.getState().setActiveOverlay(id);
    const overlay = useDocumentStore
      .getState()
      .doc.overlays.find((candidate) => candidate.id === id);
    if (!overlay) return;
    const start = { x: event.clientX, y: event.clientY, position: overlay.position };
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let moved = false;
    const move = (e: PointerEvent) => {
      if (!moved) {
        gesture.begin('Move overlay');
        moved = true;
      }
      const dx = (e.clientX - start.x) / width;
      const dy = (e.clientY - start.y) / height;
      const snap = (value: number) => (Math.abs(value - 0.5) < 0.008 ? 0.5 : value);
      updateOverlay(id, 'Move overlay', (draft) => {
        draft.position = [snap(start.position[0] + dx), snap(start.position[1] + dy)];
      });
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      if (moved) gesture.end();
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width, height }}
        data-testid="overlay-canvas"
        aria-hidden
      />
      {editing &&
        boxes.map((box) => (
          <div
            key={box.id}
            className={styles.handle}
            data-active={box.id === activeId || undefined}
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              transform: box.rotation ? `rotate(${box.rotation}deg)` : undefined,
            }}
            onPointerDown={(event) => startDrag(event, box.id)}
            data-testid="overlay-handle"
          />
        ))}
    </>
  );
}

/** Studio-only composition guides (safe zones, grids, centre lines). */
export function GuidesLayer() {
  const guides = useUiStore((state) => state.guides);
  const frame = useDocumentStore((state) => state.doc.frame);
  const { width: w, height: h } = frame;
  const lines: [number, number, number, number][] = [];
  const vertical = (x: number) => lines.push([x * w, 0, x * w, h]);
  const horizontal = (y: number) => lines.push([0, y * h, w, y * h]);
  const cross = (values: number[]) => {
    for (const value of values) {
      vertical(value);
      horizontal(value);
    }
  };
  if (guides.grid === 'thirds') cross([1 / 3, 2 / 3]);
  if (guides.grid === 'golden') cross([0.382, 0.618]);
  if (guides.grid === 'columns')
    for (let i = 1; i < guides.columns; i++) vertical(0.05 + (0.9 * i) / guides.columns);
  if (guides.center) {
    vertical(0.5);
    horizontal(0.5);
  }
  const social = guides.safe && frame.preset === '9:16';
  if (!guides.safe && !lines.length) return null;
  return (
    <svg
      className={styles.guides}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      data-testid="guides"
    >
      {social && (
        <>
          <rect x={0} y={0} width={w} height={h * 0.14} className={styles.zone} />
          <rect x={0} y={h * 0.8} width={w} height={h * 0.2} className={styles.zone} />
          <rect
            x={w * 0.86}
            y={h * 0.45}
            width={w * 0.14}
            height={h * 0.35}
            className={styles.zone}
          />
        </>
      )}
      {guides.safe && (
        <>
          <rect
            x={w * 0.05}
            y={h * 0.05}
            width={w * 0.9}
            height={h * 0.9}
            className={styles.safe}
          />
          <rect x={w * 0.1} y={h * 0.1} width={w * 0.8} height={h * 0.8} className={styles.title} />
        </>
      )}
      {lines.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1}-${y1}-${x2}-${y2}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          className={styles.line}
        />
      ))}
    </svg>
  );
}
