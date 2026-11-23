import type { Camera as CameraSpec } from '@galbe/core';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { type ComponentRef, useLayoutEffect, useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { useDocumentStore } from '../state/documentStore.ts';
import { useUiStore } from '../state/uiStore.ts';

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Orbit controls bound to the document camera (orbiting is not an undo step). */
export function CameraRig() {
  const camera = useThree((state) => state.camera) as PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const spec = useDocumentStore((state) => state.doc.camera);
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
    useDocumentStore.getState().update(
      (draft) => {
        draft.camera.position = [
          round4(camera.position.x),
          round4(camera.position.y),
          round4(camera.position.z),
        ];
        draft.camera.target = [round4(target.x), round4(target.y), round4(target.z)];
      },
      { history: false },
    );
    committed.current = useDocumentStore.getState().doc.camera;
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
