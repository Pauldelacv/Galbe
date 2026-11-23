import { getFramePreset } from '@galbe/core';
import { Canvas } from '@react-three/fiber';
import { Focus, Move3d, Rotate3d, Scale3d } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEngineStatus } from '../engine/studioEngine.ts';
import { frameSelection } from '../state/actions.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { useUiStore } from '../state/uiStore.ts';
import { IconButton } from '../ui/controls.tsx';
import { CameraRig } from './CameraRig.tsx';
import { fitFrame } from './frameFit.ts';
import { SceneBridge } from './SceneBridge.tsx';
import { SelectionGizmo } from './SelectionGizmo.tsx';
import styles from './Viewport.module.css';
import { ViewportStatus } from './ViewportStatus.tsx';

const MAX_DPR = 2;

export function Viewport() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 800, height: 600 });
  const frame = useDocumentStore((state) => state.doc.frame);
  const transparent = useDocumentStore((state) => state.doc.background.type === 'transparent');
  const interacting = useUiStore((state) => state.interacting > 0);
  const gizmo = useUiStore((state) => state.gizmo);
  const setGizmo = useUiStore((state) => state.setGizmo);
  const pointerDown = useRef<{ x: number; y: number } | null>(null);
  const ready = useEngineStatus((state) => state.synced && state.loading === 0);

  useEffect(() => {
    const element = stageRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStage({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const size = fitFrame(stage, frame, 40);
  const dpr = interacting ? 1 : Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const preset = getFramePreset(frame.preset);

  return (
    <div
      className={styles.stage}
      ref={stageRef}
      data-testid="viewport"
      data-ready={ready || undefined}
    >
      <div className={styles.toolbar}>
        <IconButton
          label="Move (W)"
          active={gizmo === 'translate'}
          onClick={() => setGizmo('translate')}
        >
          <Move3d />
        </IconButton>
        <IconButton
          label="Rotate (E)"
          active={gizmo === 'rotate'}
          onClick={() => setGizmo('rotate')}
        >
          <Rotate3d />
        </IconButton>
        <IconButton label="Scale (R)" active={gizmo === 'scale'} onClick={() => setGizmo('scale')}>
          <Scale3d />
        </IconButton>
        <span className={styles.divider} />
        <IconButton label="Frame selection (F)" onClick={frameSelection}>
          <Focus />
        </IconButton>
      </div>

      <div
        className={styles.frame}
        style={{ width: size.width, height: size.height }}
        data-transparent={transparent || undefined}
        onPointerDownCapture={(event) => {
          pointerDown.current = { x: event.clientX, y: event.clientY };
        }}
      >
        <Canvas
          frameloop="demand"
          dpr={dpr}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{ fov: 27, near: 0.05, far: 500, position: [0, 0.4, 9] }}
          onPointerMissed={(event) => {
            const start = pointerDown.current;
            if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 4) return;
            useUiStore.getState().select([]);
          }}
          data-testid="viewport-canvas"
        >
          <SceneBridge />
          <CameraRig />
          <SelectionGizmo />
        </Canvas>
      </div>

      <div className={styles.frameInfo}>
        {frame.width} × {frame.height}
        <span>{preset ? preset.hint : 'Custom'}</span>
      </div>
      <ViewportStatus />
    </div>
  );
}
