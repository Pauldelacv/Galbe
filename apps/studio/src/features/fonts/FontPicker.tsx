import { BUILTIN_FONTS, type BuiltinFontFamily, closestFace } from '@galbe/assets';
import { builtinUri, type FontRef } from '@galbe/core';
import { Loader2, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_BASE_URL } from '../../engine/studioEngine.ts';
import { pickFiles } from '../../lib/files.ts';
import { notify } from '../../state/toastStore.ts';
import { Button, Segmented, Select, Toggle } from '../../ui/controls.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import styles from './FontPicker.module.css';
import {
  type CatalogFamily,
  downloadGoogleFont,
  googlePreviewUrl,
  importFontFile,
  loadGoogleCatalog,
} from './fontAssets.ts';
import { previewFamily } from './previewFonts.ts';

export const FONT_FILE_ACCEPT = '.ttf,.otf,.woff,font/ttf,font/otf,font/woff';
const MAX_ROWS = 120;

export function builtinFontRef(
  family: BuiltinFontFamily,
  weight: number,
  style: 'normal' | 'italic',
): FontRef {
  const face = closestFace(family, weight, style);
  return {
    family: family.family,
    weight: face.weight,
    style: face.style,
    files: face.files.map(builtinUri),
  };
}

const faceLabel = (weight: number, style: string) => `${weight}${style === 'italic' ? ' it' : ''}`;

/** Renders its children in a preview face once the row scrolls into view. */
function Preview({
  fontKey,
  url,
  text,
  weight,
  style,
}: {
  fontKey: string;
  url: string;
  text: string;
  weight: number;
  style: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [family, setFamily] = useState<string | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect();
      void previewFamily(fontKey, url, { weight: String(weight), style }).then(setFamily);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [fontKey, url, weight, style]);
  return (
    <span
      ref={ref}
      className={styles.preview}
      style={family ? { fontFamily: `"${family}"` } : { opacity: 0.35 }}
    >
      {text}
    </span>
  );
}

export function FontPicker({
  current,
  sample,
  onPick,
  onClose,
}: {
  current: FontRef;
  sample: string;
  onPick: (font: FontRef) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'builtin' | 'google'>('builtin');
  const [query, setQuery] = useState('');
  const text = sample.split('\n')[0]?.slice(0, 24) || 'Galbe';

  const pick = (font: FontRef) => {
    onPick(font);
    onClose();
  };

  const importFile = async () => {
    const [file] = await pickFiles(FONT_FILE_ACCEPT);
    if (!file) return;
    try {
      pick(await importFontFile(file));
      notify(`Imported ${file.name}`, 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'This font could not be read.', 'error');
    }
  };

  return (
    <Dialog
      title="Font"
      onClose={onClose}
      width={560}
      footer={
        <>
          <Button icon={<Upload />} onClick={importFile}>
            Import .ttf / .otf / .woff
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <Segmented
        label="Font source"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'builtin', label: 'Built-in' },
          { value: 'google', label: 'Google Fonts' },
        ]}
      />
      <input
        className={styles.search}
        placeholder={tab === 'builtin' ? 'Search built-in fonts' : 'Search 1,800+ Google Fonts'}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        aria-label="Search fonts"
        autoFocus
      />
      {tab === 'builtin' ? (
        <BuiltinList query={query} current={current} text={text} onPick={pick} />
      ) : (
        <GoogleList query={query} current={current} text={text} onPick={pick} />
      )}
    </Dialog>
  );
}

function BuiltinList({
  query,
  current,
  text,
  onPick,
}: {
  query: string;
  current: FontRef;
  text: string;
  onPick: (font: FontRef) => void;
}) {
  const families = BUILTIN_FONTS.filter((family) =>
    family.family.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className={styles.list} role="listbox" aria-label="Built-in fonts">
      {families.map((family) => {
        const face = closestFace(family, 700, 'normal');
        const active = family.family === current.family;
        return (
          <div key={family.id} className={styles.row} data-active={active || undefined}>
            <button
              type="button"
              className={styles.rowMain}
              onClick={() => onPick(builtinFontRef(family, current.weight, current.style))}
              title={family.description}
            >
              <Preview
                fontKey={`builtin-${family.id}-${face.weight}-${face.style}`}
                url={`${BUILTIN_BASE_URL}${face.files[0]}.ttf`}
                text={text}
                weight={face.weight}
                style={face.style}
              />
              <span className={styles.meta}>
                {family.family} · {family.category}
              </span>
            </button>
            <div className={styles.faces}>
              {family.faces.map((option) => (
                <button
                  key={`${option.weight}-${option.style}`}
                  type="button"
                  className={styles.face}
                  data-active={
                    (active &&
                      current.weight === option.weight &&
                      current.style === option.style) ||
                    undefined
                  }
                  onClick={() => onPick(builtinFontRef(family, option.weight, option.style))}
                >
                  {faceLabel(option.weight, option.style)}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GoogleList({
  query,
  current,
  text,
  onPick,
}: {
  query: string;
  current: FontRef;
  text: string;
  onPick: (font: FontRef) => void;
}) {
  const [catalog, setCatalog] = useState<CatalogFamily[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState('all');
  const [italic, setItalic] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setError(null);
    loadGoogleCatalog().then(setCatalog, (reason: unknown) =>
      setError(reason instanceof Error ? reason.message : 'The catalogue could not be loaded.'),
    );
  };
  useEffect(load, []);

  const categories = useMemo(
    () => [...new Set(catalog?.map((family) => family.category) ?? [])].sort(),
    [catalog],
  );
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog ?? []).filter(
      (family) =>
        (category === 'all' || family.category === category) &&
        (!italic || family.styles.includes('italic')) &&
        (!q || family.family.toLowerCase().includes(q)),
    );
  }, [catalog, query, category, italic]);

  const choose = async (family: CatalogFamily, weight: number) => {
    const style = italic && family.styles.includes('italic') ? 'italic' : 'normal';
    setBusy(`${family.id}-${weight}`);
    try {
      onPick(await downloadGoogleFont(family, weight, style));
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : 'Download failed.', 'error');
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className={styles.empty}>
        {error}
        <Button size="sm" onClick={load}>
          Retry
        </Button>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className={styles.empty}>
        <Loader2 className={styles.spin} /> Loading the catalogue…
      </div>
    );
  }
  return (
    <>
      <div className={styles.filters}>
        <Select
          label="Category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
        <Toggle label="Italic" checked={italic} onChange={setItalic} />
      </div>
      <div className={styles.list} role="listbox" aria-label="Google Fonts">
        {matches.slice(0, MAX_ROWS).map((family) => {
          const nearest = family.weights.reduce((a, b) =>
            Math.abs(b - current.weight) < Math.abs(a - current.weight) ? b : a,
          );
          const previewWeight = family.weights.includes(700) ? 700 : nearest;
          return (
            <div
              key={family.id}
              className={styles.row}
              data-active={family.family === current.family || undefined}
            >
              <button
                type="button"
                className={styles.rowMain}
                onClick={() => choose(family, nearest)}
                disabled={!!busy}
              >
                <Preview
                  fontKey={`google-${family.id}-${previewWeight}`}
                  url={googlePreviewUrl(family, previewWeight)}
                  text={text}
                  weight={previewWeight}
                  style="normal"
                />
                <span className={styles.meta}>
                  {family.family} · {family.category}
                  {busy?.startsWith(`${family.id}-`) && <Loader2 className={styles.spin} />}
                </span>
              </button>
              <div className={styles.faces}>
                {family.weights.map((weight) => (
                  <button
                    key={weight}
                    type="button"
                    className={styles.face}
                    disabled={!!busy}
                    data-active={
                      (family.family === current.family && current.weight === weight) || undefined
                    }
                    onClick={() => choose(family, weight)}
                  >
                    {weight}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
        {matches.length > MAX_ROWS && (
          <div className={styles.more}>{matches.length - MAX_ROWS} more — refine your search</div>
        )}
        {!matches.length && <div className={styles.empty}>No matching family.</div>}
      </div>
      <p className={styles.note}>
        Fonts come from the Google Fonts library (SIL Open Font License) via Fontsource. The chosen
        style is downloaded once and saved inside your project.
      </p>
    </>
  );
}
