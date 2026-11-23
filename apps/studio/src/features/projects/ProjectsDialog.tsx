import { FilePlus2, FolderOpen, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { pickFiles } from '../../lib/files.ts';
import { importGalbeFile } from '../../persistence/galbeFiles.ts';
import {
  deleteProject,
  listProjects,
  loadProject,
  type ProjectSummary,
} from '../../persistence/projectStore.ts';
import { openDocument } from '../../persistence/session.ts';
import { newProject } from '../../state/actions.ts';
import { useDocumentStore } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, IconButton } from '../../ui/controls.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import styles from './ProjectsDialog.module.css';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ProjectsDialog() {
  const close = () => useUiStore.getState().openDialog(null);
  const currentId = useDocumentStore((state) => state.doc.id);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  const refresh = useCallback(() => listProjects().then(setProjects, () => setProjects([])), []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!projects) return;
    const urls: Record<string, string> = {};
    for (const project of projects)
      if (project.thumbnail) urls[project.id] = URL.createObjectURL(project.thumbnail);
    setThumbs(urls);
    return () => {
      for (const url of Object.values(urls)) URL.revokeObjectURL(url);
    };
  }, [projects]);

  const open = async (id: string) => {
    try {
      const doc = await loadProject(id);
      close();
      if (doc) await openDocument(doc);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'This project could not be opened.', 'error');
    }
  };

  const remove = async (project: ProjectSummary) => {
    if (!window.confirm(`Delete "${project.name}"? This cannot be undone.`)) return;
    await deleteProject(project.id);
    if (project.id === currentId) await newProject();
    await refresh();
  };

  const importFile = async () => {
    const [file] = await pickFiles('.galbe');
    if (!file) return;
    try {
      const { warnings } = await importGalbeFile(file);
      for (const warning of warnings) notify(warning, 'error');
      close();
    } catch (error) {
      notify(error instanceof Error ? error.message : 'This file could not be opened.', 'error');
    }
  };

  return (
    <Dialog
      title="Projects"
      onClose={close}
      width={640}
      footer={
        <>
          <Button icon={<FolderOpen />} onClick={importFile}>
            Open .galbe file
          </Button>
          <span style={{ flex: 1 }} />
          <Button
            variant="primary"
            icon={<FilePlus2 />}
            onClick={() => {
              close();
              void newProject();
            }}
          >
            New project
          </Button>
        </>
      }
    >
      <p className={styles.note}>
        Projects are saved automatically in this browser. Use .galbe files to back up or share them.
      </p>
      <div className={styles.grid}>
        {projects?.map((project) => (
          <div
            key={project.id}
            className={styles.card}
            data-current={project.id === currentId || undefined}
          >
            <button type="button" className={styles.open} onClick={() => open(project.id)}>
              <span className={styles.thumb}>
                {thumbs[project.id] && <img src={thumbs[project.id]} alt="" />}
              </span>
              <span className={styles.name}>{project.name}</span>
              <span className={styles.date}>{dateFormat.format(new Date(project.updatedAt))}</span>
            </button>
            <IconButton
              label={`Delete ${project.name}`}
              size="sm"
              className={styles.delete}
              onClick={() => remove(project)}
            >
              <Trash2 />
            </IconButton>
          </div>
        ))}
        {projects?.length === 0 && <p className={styles.note}>No saved projects yet.</p>}
      </div>
    </Dialog>
  );
}
