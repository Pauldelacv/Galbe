import { TransformControls } from '@react-three/drei';
import { controller, requestRender } from '../engine/studioEngine.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { gesture, useUiStore } from '../state/uiStore.ts';

const DEG = 180 / Math.PI;
const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

/** Move / rotate / scale gizmo on the single selected node. */
export function SelectionGizmo() {
  const id = useUiStore((state) => (state.selection.length === 1 ? state.selection[0]! : null));
  const mode = useUiStore((state) => state.gizmo);
  const node = useDocumentStore((state) =>
    id ? state.doc.nodes.find((candidate) => candidate.id === id) : undefined,
  );
  const object = id ? controller.objectOf(id) : undefined;
  if (!id || !node || !object || node.locked || !node.visible) return null;

  return (
    <TransformControls
      object={object}
      mode={mode}
      size={0.75}
      onMouseDown={() =>
        gesture.begin(mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale')
      }
      onMouseUp={() => gesture.end()}
      onObjectChange={() => {
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
        requestRender();
      }}
    />
  );
}
