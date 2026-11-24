import { frameCount, isAnimated, MAX_EXPORT_SIDE } from '@galbe/core';
import { type ImageFormat, scaledSize, type VideoFormat, videoSupport } from '@galbe/exporters';
import { Download, Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../../state/documentStore.ts';
import { notify } from '../../state/toastStore.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Button, Field, Segmented, Toggle } from '../../ui/controls.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import { Slider } from '../../ui/Slider.tsx';
import { formatTimecode } from '../timeline/Timeline.tsx';
import styles from './ExportDialog.module.css';
import { exportImage } from './exportImage.ts';
import { exportVideo, MAX_VIDEO_SIDE, videoSize } from './exportVideo.ts';

const SCALES = [1, 2, 3, 4, 8] as const;

export function ExportDialog() {
  const animated = useDocumentStore((state) => isAnimated(state.doc));
  const [kind, setKind] = useState<'image' | 'video'>(animated ? 'video' : 'image');
  const tabs = (
    <Field label="Export">
      <Segmented
        label="Export kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'image', label: 'Image' },
          { value: 'video', label: 'Video', title: 'Render the timeline as a video' },
        ]}
      />
    </Field>
  );
  return kind === 'image' ? <ImageExport tabs={tabs} /> : <VideoExport tabs={tabs} />;
}

function ImageExport({ tabs }: { tabs: ReactNode }) {
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
      {tabs}
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
        the frame is exported, at the playhead.
      </p>
    </Dialog>
  );
}

const VIDEO_SCALES = [0.5, 1, 2] as const;

function VideoExport({ tabs }: { tabs: ReactNode }) {
  const close = () => useUiStore.getState().openDialog(null);
  const frame = useDocumentStore((state) => state.doc.frame);
  const animation = useDocumentStore((state) => state.doc.animation);
  const backgroundType = useDocumentStore((state) => state.doc.background.type);
  const [format, setFormat] = useState<VideoFormat>('mp4');
  const [scale, setScale] = useState<number>(1);
  const [transparent, setTransparent] = useState(backgroundType === 'transparent');
  const [bitrate, setBitrate] = useState(16);
  const [support, setSupport] = useState<Awaited<ReturnType<typeof videoSupport>> | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  const size = videoSize(frame, scale);
  const frames = frameCount(animation);
  const alphaPossible = format === 'png' || (format === 'webm' && !!support?.webmAlpha);

  useEffect(() => {
    let cancelled = false;
    void videoSupport(size.width, size.height).then((result) => {
      if (cancelled) return;
      setSupport(result);
      setFormat((current) =>
        current !== 'png' && !result[current]
          ? result.mp4
            ? 'mp4'
            : result.webm
              ? 'webm'
              : 'png'
          : current,
      );
    });
    return () => {
      cancelled = true;
    };
  }, [size.width, size.height]);

  const run = async () => {
    abort.current = new AbortController();
    setProgress({ done: 0, total: frames });
    try {
      const result = await exportVideo({
        format,
        scale,
        transparent: transparent && alphaPossible,
        bitrate,
        signal: abort.current.signal,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      notify(
        `Exported ${result.frames} frames · ${result.width} × ${result.height} (${result.codec.toUpperCase()})`,
        'success',
      );
      close();
    } catch (error) {
      if (!abort.current.signal.aborted)
        notify(error instanceof Error ? error.message : 'Video export failed.', 'error');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog
      title="Export video"
      onClose={() => {
        abort.current?.abort();
        close();
      }}
      width={420}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              abort.current?.abort();
              close();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={progress ? <Loader2 className={styles.spin} /> : <Download />}
            onClick={run}
            disabled={!!progress || !support}
            data-testid="export-confirm"
          >
            {progress ? `Frame ${progress.done}/${progress.total}…` : 'Export'}
          </Button>
        </>
      }
    >
      {tabs}
      <Field label="Format">
        <Segmented
          label="Video format"
          value={format}
          onChange={setFormat}
          options={[
            {
              value: 'mp4',
              label: 'MP4',
              title:
                support?.mp4 === false
                  ? 'Not supported by this browser'
                  : 'H.264 — plays everywhere',
            },
            {
              value: 'webm',
              label: 'WebM',
              title:
                support?.webm === false
                  ? 'Not supported by this browser'
                  : 'VP9 — supports transparency',
            },
            {
              value: 'png',
              label: 'PNG seq.',
              title: 'One PNG per frame, zipped — lossless, with alpha',
            },
          ]}
        />
      </Field>
      <Field label="Size">
        <Segmented
          label="Scale"
          value={String(scale)}
          onChange={(value) => setScale(Number(value))}
          options={VIDEO_SCALES.map((value) => ({ value: String(value), label: `${value}×` }))}
        />
      </Field>
      <div className={styles.summary} data-testid="export-size">
        <strong>
          {size.width} × {size.height}
        </strong>{' '}
        px · {animation.fps} fps · {formatTimecode(animation.duration, animation.fps)} · {frames}{' '}
        frames
        {Math.max(frame.width, frame.height) * scale > MAX_VIDEO_SIDE && (
          <span className={styles.clamped}> · limited to {MAX_VIDEO_SIDE} px</span>
        )}
      </div>
      {format !== 'png' && (
        <Slider
          label="Bitrate"
          value={bitrate}
          min={1}
          max={80}
          step={1}
          precision={0}
          unit=" Mb/s"
          defaultValue={16}
          onChange={setBitrate}
        />
      )}
      <Field label="Background">
        <Toggle
          label="Transparent"
          checked={transparent && alphaPossible}
          onChange={setTransparent}
        />
      </Field>
      {format === 'mp4' && (
        <p className={styles.hint}>MP4 has no transparency: use WebM or a PNG sequence.</p>
      )}
      {format === 'webm' && support && !support.webmAlpha && (
        <p className={styles.hint}>
          This browser cannot encode transparent WebM: use a PNG sequence.
        </p>
      )}
      {support && format !== 'png' && !support[format] && (
        <p className={styles.hint}>
          This browser cannot encode {format.toUpperCase()} at this size.
        </p>
      )}
      <p className={styles.hint}>
        Every frame is rendered at its exact time, so the video is identical on any machine, however
        long a frame takes. Keep this tab visible while it renders.
      </p>
    </Dialog>
  );
}
