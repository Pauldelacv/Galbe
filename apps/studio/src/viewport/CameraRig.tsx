import { baseCameraFor, type Camera as CameraSpec } from '@galbe/core';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { type ComponentRef, useLayoutEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { useEvaluatedStore } from '../engine/evaluatedStore.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { usePlaybackStore } from '../state/playbackStore.ts';
import { useUiStore } from '../state/uiStore.ts';

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Orbit controls bound to the document camera (orbiting is not an undo step). */
export function CameraRig() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  // The camera as animated at the playhead (falls back to the document's).
  const baseSpec = useDocumentStore((state) => state.doc.camera);
  const evaluatedSpec = useEvaluatedStore((state) => state.doc?.camera);
  const spec = evaluatedSpec ?? baseSpec;
  const committed = useRef<CameraSpec | null>(null);

  useLayoutEffect(() => {
    if (spec === committed.current) return;
    camera.fov = spec.fov;
    camera.near = spec.near;
    camera.far = spec.far;
    camera.position.set(...spec.position);
    controls.current?.target.set(...spec.target);
    camera.lookAt(...spec.target);
    camera.updateProjectionMatrix();
    controls.current?.update();
    invalidate();
  }, [spec, camera, invalidate]);

  const commit = () => {
    const target = controls.current?.target;
    if (!target) return;
    const { doc } = useDocumentStore.getState();
    const shown: CameraSpec = {
      ...doc.camera,
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [target.x, target.y, target.z],
    };
    // Camera motions (orbit, dolly…) are added on top of the document camera: store the
    // camera that, once moved, gives what the user framed.
    const base = baseCameraFor(doc, shown, usePlaybackStore.getState().time);
    useDocumentStore.getState().update(
      (draft) => {
        draft.camera.position = [
          round4(base.position[0]),
          round4(base.position[1]),
          round4(base.position[2]),
        ];
        draft.camera.target = [
          round4(base.target[0]),
          round4(base.target[1]),
          round4(base.target[2]),
        ];
      },
      { history: false },
    );
    committed.current = useEvaluatedStore.getState().doc?.camera ?? null;
  };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={false}
      zoomSpeed={0.6}
      rotateSpeed={0.7}
      onStart={() => useUiStore.getState().setInteracting(true)}
      onEnd={() => {
        useUiStore.getState().setInteracting(false);
        commit();
      }}
    />
  );
}
