import { useEffect, useMemo, useState } from 'react';
import { ExportDialog } from '../features/export/ExportDialog.tsx';
import { Inspector } from '../features/inspector/Inspector.tsx';
import { ProjectsDialog } from '../features/projects/ProjectsDialog.tsx';
import { ShortcutsDialog } from '../features/shortcuts/ShortcutsDialog.tsx';
import { Timeline } from '../features/timeline/Timeline.tsx';
import { pickFiles } from '../lib/files.ts';
import { createHotkeys, installHotkeys, isEditable } from '../lib/hotkeys.ts';
import { LeftPanel } from '../panels/LeftPanel.tsx';
import { TopBar } from '../panels/TopBar.tsx';
import { exportGalbeFile } from '../persistence/galbeFiles.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { addShapeFromSvg } from '../state/objectActions.ts';
import { usePlaybackStore } from '../state/playbackStore.ts';
import { notify } from '../state/toastStore.ts';
import { useUiStore } from '../state/uiStore.ts';
import { Viewport } from '../viewport/Viewport.tsx';
import styles from './App.module.css';
import { handleFiles } from './fileDrop.ts';
import { Toasts } from './Toasts.tsx';

const saveFile = () =>
  exportGalbeFile(useDocumentStore.getState().doc).catch((error: unknown) =>
    notify(error instanceof Error ? error.message : 'Could not save the file.', 'error'),
  );
const openFile = async () => handleFiles(await pickFiles('.galbe'));

export function App() {
  const panels = useUiStore((state) => state.panels);
  const dialog = useUiStore((state) => state.dialog);
  const timelineOpen = usePlaybackStore((state) => state.timelineOpen);
  const hotkeys = useMemo(() => createHotkeys({ saveFile, openFile }), []);
  const [dragging, setDragging] = useState(false);

  useEffect(() => installHotkeys(hotkeys), [hotkeys]);

  // Paste SVG markup (Figma "Copy as SVG", Illustrator) or files from the clipboard.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (isEditable(event.target) || useUiStore.getState().dialog) return;
      const files = [...(event.clipboardData?.files ?? [])];
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (files.length) {
        event.preventDefault();
        void handleFiles(files);
      } else if (/<svg[\s>]/i.test(text)) {
        event.preventDefault();
        addShapeFromSvg(text).catch((error: unknown) =>
          notify(error instanceof Error ? error.message : 'Could not paste this SVG.', 'error'),
        );
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false;
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const onOver = (event: DragEvent) => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      void handleFiles([...(event.dataTransfer?.files ?? [])]);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return (
    <div className={styles.app}>
      <TopBar onSaveFile={saveFile} onOpenFile={openFile} />
      <main className={styles.main}>
        {panels.left && <LeftPanel />}
        <div className={styles.center}>
          <Viewport />
          {timelineOpen && <Timeline />}
        </div>
        {panels.right && <Inspector />}
      </main>
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'projects' && <ProjectsDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog hotkeys={hotkeys} />}
      {dragging && (
        <div className={styles.drop}>
          <div>
            Drop a <strong>.galbe</strong> project, an <strong>SVG</strong>, a{' '}
            <strong>3D model</strong> (GLB, GLTF, FBX, OBJ), a <strong>font</strong>, an{' '}
            <strong>.hdr</strong> environment, <strong>textures</strong> (images or a zipped PBR
            set), a <strong>video</strong> (background or texture) or a <strong>.cube</strong> LUT
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}
