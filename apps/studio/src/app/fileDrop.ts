import { importHdriFile } from '../features/environment/importHdri.ts';
import { importFontFile } from '../features/fonts/fontAssets.ts';
import { updateText } from '../features/inspector/edit.ts';
import {
  applyTextureFiles,
  applyTextureZip,
  importLutFile,
} from '../features/objects/importObjects.ts';
import { detectFileKind } from '../lib/fileKind.ts';
import { importGalbeFile } from '../persistence/galbeFiles.ts';
import { addText } from '../state/actions.ts';
import { useDocumentStore } from '../state/documentStore.ts';
import { addModelFile, addShapeFromSvg } from '../state/objectActions.ts';
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
      } else if (kind === 'svg') {
        await addShapeFromSvg(await file.text(), { file });
      } else if (kind === 'model') {
        await addModelFile(file);
      } else if (kind === 'lut') {
        await importLutFile(file);
        notify(`LUT "${file.name}" applied`, 'success');
      } else if (kind === 'image') {
        const images = files.filter((candidate) =>
          /\.(png|jpe?g|webp|avif)$/i.test(candidate.name),
        );
        if (file !== images[0]) continue; // the whole batch is handled once, as a texture set
        const count = await applyTextureFiles(
          await Promise.all(
            images.map(async (image) => ({
              name: image.name,
              bytes: new Uint8Array(await image.arrayBuffer()),
            })),
          ),
        );
        if (count) notify(`${count} texture${count > 1 ? 's' : ''} applied`, 'success');
      } else if (kind === 'zip') {
        const count = await applyTextureZip(file);
        if (count) notify(`Texture set applied (${count} maps)`, 'success');
        else notify(`${file.name}: no recognisable texture maps found.`, 'error');
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
