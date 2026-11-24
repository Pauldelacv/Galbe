import { PostStack } from '@galbe/engine';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { drawWithEffects } from '../engine/cleanRender.ts';
import { useEvaluatedStore } from '../engine/evaluatedStore.ts';
import { setViewportRefresh, showFrame } from '../engine/frame.ts';
import { controller, publishStatus, setInvalidate, viewport } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { usePlaybackStore } from '../state/playbackStore.ts';
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
    const post = new PostStack(gl, controller.background);
    viewport.post = post;
    controller.attach(scene, { content: false });

    const apply = () => {
      const { time } = usePlaybackStore.getState();
      const { doc } = showFrame(useDocumentStore.getState().doc, time);
      useEvaluatedStore.setState({ doc, time });
      publishStatus();
      invalidate();
    };
    apply();
    setViewportRefresh(apply);
    const unsubscribe = useDocumentStore.subscribe((state, previous) => {
      if (state.doc !== previous.doc) apply();
    });
    const unsubscribePlayback = usePlaybackStore.subscribe((state, previous) => {
      if (state.playing !== previous.playing) controller.setPlaying(state.playing);
      if (state.time !== previous.time || state.playing !== previous.playing) apply();
    });
    return () => {
      unsubscribe();
      unsubscribePlayback();
      setViewportRefresh(() => {});
      controller.setPlaying(false);
      controller.detach();
      post.dispose();
      viewport.post = null;
      viewport.gl = viewport.scene = viewport.camera = null;
      setInvalidate(() => {});
    };
  }, [gl, scene, camera, invalidate]);

  // Pre-passes (contact shadows), then the frame itself, through the effect stack if any.
  // A positive priority tells R3F that this hook renders the frame.
  useFrame(({ gl: renderer, scene: frameScene, camera: frameCamera }) => {
    controller.prepareFrame(renderer);
    drawWithEffects(renderer, frameScene, frameCamera);
  }, 1);

  const onClick = (event: ThreeEvent<MouseEvent>) => {
    if (event.delta > 4) return;
    event.stopPropagation();
    const id = controller.nodeIdOf(event.object);
    if (!id) return;
    const node = useDocumentStore.getState().doc.nodes.find((candidate) => candidate.id === id);
    if (!node || node.locked) return;
    useUiStore.getState().select([id], event.shiftKey ? 'toggle' : 'replace');
    // Alt+click on a shape picks the clicked path (its material is then edited).
    const pathId = event.object.userData.pathId;
    if (event.altKey && node.type === 'shape' && typeof pathId === 'string') {
      useUiStore.getState().setActivePath(pathId);
    }
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
