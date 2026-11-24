import { findNode, topLevelIds } from '@galbe/core';
import { TransformControls } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import { Box3, Euler, Matrix4, Object3D, Quaternion, Vector3 } from 'three';
import { controller, requestRender } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { gesture, useUiStore } from '../state/uiStore.ts';

const DEG = 180 / Math.PI;
const round4 = (value: number) => Math.round(value * 1e4) / 1e4;
const label = (mode: string) =>
  mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale';

/** Writes an object's local transform back into its node. */
function commit(id: string, object: Object3D) {
  useDocumentStore.getState().update((draft) => {
    const target = draft.nodes.find((candidate) => candidate.id === id);
    if (!target) return;
    target.transform.position = [
      round4(object.position.x),
      round4(object.position.y),
      round4(object.position.z),
    ];
    target.transform.rotation = [
      round4(object.rotation.x * DEG),
      round4(object.rotation.y * DEG),
      round4(object.rotation.z * DEG),
    ];
    target.transform.scale = [
      round4(object.scale.x),
      round4(object.scale.y),
      round4(object.scale.z),
    ];
  });
}

/** Move / rotate / scale gizmo: on the node itself, or around the centre of a multi-selection. */
export function SelectionGizmo() {
  const selection = useUiStore((state) => state.selection);
  const mode = useUiStore((state) => state.gizmo);
  const doc = useDocumentStore((state) => state.doc);
  const ids = useMemo(
    () =>
      topLevelIds(doc, selection).filter((id) => {
        const node = findNode(doc, id);
        return node && !node.locked && node.visible;
      }),
    [doc, selection],
  );
  if (ids.length === 1) return <SingleGizmo id={ids[0]!} mode={mode} />;
  if (ids.length > 1) return <MultiGizmo ids={ids} mode={mode} />;
  return null;
}

function SingleGizmo({ id, mode }: { id: string; mode: 'translate' | 'rotate' | 'scale' }) {
  const object = controller.objectOf(id);
  if (!object) return null;
  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.75}
      onMouseDown={() => gesture.begin(label(mode))}
      onMouseUp={() => gesture.end()}
      onObjectChange={() => {
        commit(id, object);
        requestRender();
      }}
    />
  );
}

interface DragState {
  pivotInverse: Matrix4;
  items: { id: string; world: Matrix4; parentInverse: Matrix4; object: Object3D }[];
}

function MultiGizmo({ ids, mode }: { ids: string[]; mode: 'translate' | 'rotate' | 'scale' }) {
  const pivot = useMemo(() => {
    const object = new Object3D();
    object.name = 'SelectionPivot';
    return object;
  }, []);
  const drag = useRef<DragState | null>(null);
  const doc = useDocumentStore((state) => state.doc);

  // Keep the pivot on the selection's centre while not dragging.
  // biome-ignore lint/correctness/useExhaustiveDependencies: doc changes move the bounds
  useEffect(() => {
    if (drag.current) return;
    const box = new Box3();
    for (const id of ids) {
      const bounds = controller.bounds(id);
      if (bounds) box.union(bounds);
    }
    if (box.isEmpty()) return;
    box.getCenter(pivot.position);
    pivot.rotation.set(0, 0, 0);
    pivot.scale.set(1, 1, 1);
    pivot.updateMatrixWorld(true);
    requestRender();
  }, [ids, doc, pivot]);

  return (
    <>
      <primitive object={pivot} />
      <TransformControls
        object={pivot}
        mode={mode}
        size={0.75}
        onMouseDown={() => {
          gesture.begin(label(mode));
          pivot.updateMatrixWorld(true);
          drag.current = {
            pivotInverse: pivot.matrixWorld.clone().invert(),
            items: ids.flatMap((id) => {
              const object = controller.objectOf(id);
              if (!object) return [];
              object.updateWorldMatrix(true, false);
              const parentInverse = object.parent
                ? object.parent.matrixWorld.clone().invert()
                : new Matrix4();
              return [{ id, object, world: object.matrixWorld.clone(), parentInverse }];
            }),
          };
        }}
        onMouseUp={() => {
          drag.current = null;
          gesture.end();
          // Re-centre the pivot (and reset its rotation) for the next gesture.
          pivot.rotation.set(0, 0, 0);
          pivot.scale.set(1, 1, 1);
          requestRender();
        }}
        onObjectChange={() => {
          const state = drag.current;
          if (!state) return;
          pivot.updateMatrixWorld(true);
          const delta = pivot.matrixWorld.clone().multiply(state.pivotInverse);
          const position = new Vector3();
          const quaternion = new Quaternion();
          const scale = new Vector3();
          useDocumentStore.getState().update((draft) => {
            for (const item of state.items) {
              const local = item.parentInverse.clone().multiply(delta).multiply(item.world);
              local.decompose(position, quaternion, scale);
              const euler = new Euler().setFromQuaternion(quaternion, 'XYZ');
              const target = draft.nodes.find((candidate) => candidate.id === item.id);
              if (!target) continue;
              target.transform.position = [
                round4(position.x),
                round4(position.y),
                round4(position.z),
              ];
              target.transform.rotation = [
                round4(euler.x * DEG),
                round4(euler.y * DEG),
                round4(euler.z * DEG),
              ];
              target.transform.scale = [round4(scale.x), round4(scale.y), round4(scale.z)];
            }
          });
          requestRender();
        }}
      />
    </>
  );
}
