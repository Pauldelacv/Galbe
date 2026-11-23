import { MAX_EXPORT_SIDE } from '@galbe/core';
import { type ImageFormat, scaledSize } from '@galbe/exporters';
import { Download, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useDocumentStore } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, Field, Segmented, Toggle } from '../../ui/controls.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { Slider } from '../../ui/Slider.tsx';
import styles from './ExportDialog.module.css';
import { exportImage } from './exportImage.ts';

const SCALES = [1, 2, 3, 4, 8] as const;

export function ExportDialog() {
  const close = () => useUiStore.getState().openDialog(null);
  const frame = useDocumentStore((state) => state.doc.frame);
  const backgroundType = useDocumentStore((state) => state.doc.background.type);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [scale, setScale] = useState<number>(2);
  const [transparent, setTransparent] = useState(backgroundType === 'transparent');
  const [quality, setQuality] = useState(0.92);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const size = scaledSize(frame, scale, MAX_EXPORT_SIDE);
  const megapixels = (size.width * size.height) / 1e6;
  const alpha = format !== 'jpeg';

  const run = async () => {
    abort.current = new AbortController();
    setProgress({ done: 0, total: 1 });
    try {
      const result = await exportImage({
        format,
        scale,
        transparent: transparent && alpha,
        quality,
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      if (!result.formatHonoured)
        notify(
          `This browser cannot encode ${format.toUpperCase()}; the file was saved in another format.`,
          'error',
        );
      else notify(`Exported ${result.width} × ${result.height}`, 'success');
      close();
    } catch (error) {
      if (!abort.current.signal.aborted)
        notify(error instanceof Error ? error.message : 'Export failed.', 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog
      title="Export image"
      onClose={() => {
        abort.current?.abort();
        close();
      }}
      width={400}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={progress ? <Loader2 className={styles.spin} /> : <Download />}
            onClick={run}
            disabled={!!progress}
            data-testid="export-confirm"
          >
            {progress
              ? progress.total > 1
                ? `Rendering ${progress.done}/${progress.total}…`
                : 'Rendering…'
              : 'Export'}
          </Button>
        </>
      }
    >
      <Field label="Format">
        <Segmented
          label="File format"
          value={format}
          onChange={setFormat}
          options={[
            { value: 'png', label: 'PNG' },
            { value: 'jpeg', label: 'JPG' },
            { value: 'webp', label: 'WebP' },
          ]}
        />
      </Field>
      <Field label="Size">
        <Segmented
          label="Scale"
          value={String(scale)}
          onChange={(value) => setScale(Number(value))}
          options={SCALES.map((value) => ({ value: String(value), label: `${value}×` }))}
        />
      </Field>
      <div className={styles.summary} data-testid="export-size">
        <strong>
          {size.width} × {size.height}
        </strong>{' '}
        px · {megapixels.toFixed(1)} MP
        {size.scale < scale && (
          <span className={styles.clamped}> · limited to {MAX_EXPORT_SIDE} px</span>
        )}
      </div>
      <Field label="Background">
        <Toggle label="Transparent" checked={transparent && alpha} onChange={setTransparent} />
      </Field>
      {!alpha && <p className={styles.hint}>JPG has no transparency: the background is filled.</p>}
      {format !== 'png' && (
        <Slider
          label="Quality"
          value={quality}
          min={0.5}
          max={1}
          step={0.01}
          precision={2}
          defaultValue={0.92}
          onChange={setQuality}
        />
      )}
      <p className={styles.hint}>
        Large sizes are rendered in tiles, so 8K works on any graphics card. Exactly what you see in
        the frame is exported.
      </p>
    </Dialog>
  );
}
