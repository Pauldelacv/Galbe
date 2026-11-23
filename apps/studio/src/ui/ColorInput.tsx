import { useEffect, useRef, useState } from 'react';
import styles from './ColorInput.module.css';

export interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onBegin?: () => void;
  onEnd?: () => void;
}

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function normaliseHex(input: string): string | null {
  const match = HEX.exec(input.trim());
  if (!match) return null;
  let hex = match[1]!.toLowerCase();
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  return `#${hex}`;
}

/** Swatch (opens the system picker) + hex field. Picker drags form one undo step. */
export function ColorInput({ label, value, onChange, onBegin, onEnd }: ColorInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const active = useRef(false);
  const callbacks = useRef({ onEnd });
  callbacks.current = { onEnd };

  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    // React maps onChange to `input`; the native `change` fires when the picker closes.
    const finish = () => {
      if (active.current) {
        active.current = false;
        callbacks.current.onEnd?.();
      }
    };
    picker.addEventListener('change', finish);
    picker.addEventListener('blur', finish);
    return () => {
      picker.removeEventListener('change', finish);
      picker.removeEventListener('blur', finish);
    };
  }, []);

  const submit = () => {
    const hex = normaliseHex(draft);
    if (hex && hex !== value) onChange(hex);
    else setDraft(value);
  };

  return (
    <div className={styles.color}>
      <label
        className={styles.swatch}
        style={{ background: value }}
        title={`${label}: pick a colour`}
      >
        <input
          ref={pickerRef}
          type="color"
          className={styles.picker}
          value={value}
          aria-label={label}
          onChange={(event) => {
            if (!active.current) {
              active.current = true;
              onBegin?.();
            }
            onChange(event.target.value);
          }}
        />
      </label>
      <input
        className={styles.hex}
        value={draft.replace('#', '').toUpperCase()}
        aria-label={`${label} hex`}
        spellCheck={false}
        maxLength={7}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={submit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') submit();
          if (event.key === 'Escape') setDraft(value);
        }}
      />
    </div>
  );
}
