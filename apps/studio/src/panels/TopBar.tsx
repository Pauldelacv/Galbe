import {
  Download,
  FolderOpen,
  HelpCircle,
  LayoutGrid,
  PanelLeft,
  PanelRight,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { MOD } from '../lib/hotkeys.ts';
import { redo, undo } from '../state/actions.ts';
import { documentApi, useDocumentStore } from '../state/documentStore.ts';
import { useUiStore } from '../state/uiStore.ts';
import { Button, IconButton } from '../ui/controls.tsx';
import styles from './TopBar.module.css';

function SaveStatus() {
  const state = useUiStore((s) => s.saveState);
  const label =
    state.status === 'saving'
      ? 'Saving…'
      : state.status === 'saved'
        ? 'Saved locally'
        : state.status === 'error'
          ? 'Not saved'
          : '';
  return (
    <span
      className={styles.status}
      data-status={state.status}
      title={state.message ?? 'Projects are stored in this browser'}
    >
      {label}
    </span>
  );
}

export function TopBar({
  onSaveFile,
  onOpenFile,
}: {
  onSaveFile: () => void;
  onOpenFile: () => void;
}) {
  const name = useDocumentStore((state) => state.doc.name);
  const canUndo = useDocumentStore((state) => state.past.length > 0);
  const canRedo = useDocumentStore((state) => state.future.length > 0);
  const panels = useUiStore((state) => state.panels);
  const { togglePanel, openDialog } = useUiStore.getState();

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <span className={styles.logo}>
          <svg viewBox="0 0 64 64" aria-hidden>
            <path
              d="M44 20.5A16 16 0 1 0 48 32H33"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </svg>
          Galbe
        </span>
        <IconButton
          label={`Projects`}
          onClick={() => openDialog('projects')}
          data-testid="projects-button"
        >
          <LayoutGrid />
        </IconButton>
        <input
          key={name}
          className={styles.name}
          defaultValue={name}
          aria-label="Project name"
          spellCheck={false}
          onBlur={(event) => {
            const value = event.target.value.trim();
            if (value && value !== name)
              documentApi.update(
                (draft) => {
                  draft.name = value;
                },
                { label: 'Rename project' },
              );
            else event.target.value = name;
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <SaveStatus />
      </div>
      <div className={styles.right}>
        <IconButton label={`Undo (${MOD}Z)`} onClick={undo} disabled={!canUndo}>
          <Undo2 />
        </IconButton>
        <IconButton label={`Redo (${MOD}⇧Z)`} onClick={redo} disabled={!canRedo}>
          <Redo2 />
        </IconButton>
        <span className={styles.divider} />
        <IconButton label={`Open .galbe file (${MOD}O)`} onClick={onOpenFile}>
          <FolderOpen />
        </IconButton>
        <IconButton label={`Save as .galbe file (${MOD}S)`} onClick={onSaveFile}>
          <Save />
        </IconButton>
        <IconButton label="Keyboard shortcuts (?)" onClick={() => openDialog('shortcuts')}>
          <HelpCircle />
        </IconButton>
        <span className={styles.divider} />
        <IconButton
          label="Toggle tools & layers ([)"
          active={panels.left}
          onClick={() => togglePanel('left')}
        >
          <PanelLeft />
        </IconButton>
        <IconButton
          label="Toggle inspector (])"
          active={panels.right}
          onClick={() => togglePanel('right')}
        >
          <PanelRight />
        </IconButton>
        <Button
          variant="primary"
          icon={<Download />}
          onClick={() => openDialog('export')}
          data-testid="export-button"
        >
          Export
        </Button>
      </div>
    </header>
  );
}
