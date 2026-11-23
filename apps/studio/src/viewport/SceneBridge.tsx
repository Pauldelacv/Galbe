import { applyRenderSettings } from '@galbe/engine';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { controller, publishStatus, setInvalidate, viewport } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { useUiStore } from '../state/uiStore.ts';

/** Keeps the engine in sync with the document and wires it into the R3F scene. */
export function SceneBridge() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    setInvalidate(invalidate);
    viewport.gl = gl;
    viewport.scene = scene;
    viewport.camera = camera;
    controller.attach(scene, { content: false });

    const apply = () => {
      const { doc } = useDocumentStore.getState();
      controller.sync(doc);
      applyRenderSettings(gl, doc.render);
      publishStatus();
      invalidate();
    };
    apply();
    const unsubscribe = useDocumentStore.subscribe((state, previous) => {
      if (state.doc !== previous.doc) apply();
    });
    return () => {
      unsubscribe();
      controller.detach();
      viewport.gl = viewport.scene = viewport.camera = null;
      setInvalidate(() => {});
    };
  }, [gl, scene, camera, invalidate]);

  // Pre-passes (contact shadows) before every rendered frame; cheap when nothing changed.
  useFrame(({ gl: renderer }) => controller.prepareFrame(renderer));

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    const id = controller.nodeIdOf(event.object);
    if (!id) return;
    const node = useDocumentStore.getState().doc.nodes.find((candidate) => candidate.id === id);
    if (!node || node.locked) return;
    useUiStore.getState().select([id], event.shiftKey ? 'toggle' : 'replace');
  };

  const onDoubleClick = (event: ThreeEvent<MouseEvent>) => {
    const id = controller.nodeIdOf(event.object);
    const node = useDocumentStore.getState().doc.nodes.find((candidate) => candidate.id === id);
    if (node?.type === 'text' && !node.locked) {
      event.stopPropagation();
      useUiStore.getState().select([node.id]);
      useUiStore.getState().requestTextFocus();
    }
  };

  return <primitive object={controller.content} onClick={onClick} onDoubleClick={onDoubleClick} />;
}
