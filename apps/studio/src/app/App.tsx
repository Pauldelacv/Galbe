import { useEffect, useMemo, useState } from 'react';
import { ExportDialog } from '../features/export/ExportDialog.tsx';
import { Inspector } from '../features/inspector/Inspector.tsx';
import { ProjectsDialog } from '../features/projects/ProjectsDialog.tsx';
import { ShortcutsDialog } from '../features/shortcuts/ShortcutsDialog.tsx';
import { pickFiles } from '../lib/files.ts';
import { createHotkeys, installHotkeys } from '../lib/hotkeys.ts';
import { LeftPanel } from '../panels/LeftPanel.tsx';
import { TopBar } from '../panels/TopBar.tsx';
import { exportGalbeFile } from '../persistence/galbeFiles.ts';
import { useDocumentStore } from '../state/documentStore.ts';
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
  const hotkeys = useMemo(() => createHotkeys({ saveFile, openFile }), []);
  const [dragging, setDragging] = useState(false);

  useEffect(() => installHotkeys(hotkeys), [hotkeys]);

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
        <Viewport />
        {panels.right && <Inspector />}
      </main>
      {dialog === 'export' && <ExportDialog />}
      {dialog === 'projects' && <ProjectsDialog />}
      {dialog === 'shortcuts' && <ShortcutsDialog hotkeys={hotkeys} />}
      {dragging && (
        <div className={styles.drop}>
          <div>
            Drop a <strong>.galbe</strong> project, a <strong>font</strong> (TTF, OTF, WOFF) or an{' '}
            <strong>.hdr</strong> environment
          </div>
        </div>
      )}
      <Toasts />
    </div>
  );
}
