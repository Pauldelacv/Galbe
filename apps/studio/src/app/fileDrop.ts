import { importHdriFile } from '../features/environment/importHdri.ts';
import { importFontFile } from '../features/fonts/fontAssets.ts';
import { updateText } from '../features/inspector/edit.ts';
import { detectFileKind } from '../lib/fileKind.ts';
import { importGalbeFile } from '../persistence/galbeFiles.ts';
import { addText } from '../state/actions.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { notify } from '../state/toastStore.ts';
import { useUiStore } from '../state/uiStore.ts';

/** Routes dropped (or opened) files to the right importer. */
export async function handleFiles(files: File[]): Promise<void> {
  for (const file of files) {
    try {
      const kind = await detectFileKind(file);
      if (kind === 'galbe') {
        const { warnings } = await importGalbeFile(file);
        for (const warning of warnings) notify(warning, 'error');
        notify(`Opened ${file.name}`, 'success');
      } else if (kind === 'font') {
        const font = await importFontFile(file);
        const { selection } = useUiStore.getState();
        const texts = useDocumentStore
          .getState()
          .doc.nodes.filter((node) => node.type === 'text' && selection.includes(node.id));
        if (texts.length)
          for (const node of texts)
            updateText(node.id, 'Font', (draft) => {
              draft.font = font;
            });
        else addText({ text: font.family, font });
        notify(`Font "${font.family}" imported`, 'success');
      } else if (kind === 'hdri') {
        await importHdriFile(file);
        notify(`Environment "${file.name}" imported`, 'success');
      } else if (kind === 'woff2') {
        notify('WOFF2 fonts are not supported yet. Use TTF, OTF or WOFF.', 'error');
      } else if (kind === 'svg' || kind === 'model') {
        notify(
          `${kind === 'svg' ? 'SVG' : '3D model'} import arrives with the Shape and Object tools (v0.2).`,
          'info',
        );
      } else {
        notify(`${file.name}: unsupported file type.`, 'error');
      }
    } catch (error) {
      notify(
        error instanceof Error ? error.message : `${file.name} could not be imported.`,
        'error',
      );
    }
  }
}
