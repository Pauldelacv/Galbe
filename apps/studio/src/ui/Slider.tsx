import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { clamp, evaluateExpression, formatNumber, roundTo } from '../lib/expression.ts';
import styles from './Slider.module.css';

export interface SliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** Hard limits (clamped). */
  min?: number;
  max?: number;
  /** Range shown by the track; defaults to min/max. Typed values may exceed it. */
  softMin?: number;
  softMax?: number;
  /** Arrow-key step. Shift = ×0.1, Alt = ×10. */
  step?: number;
  /** Value change per dragged pixel; defaults to the soft range / 240. */
  dragStep?: number;
  precision?: number;
  unit?: string;
  /** Double-click the label to reset to this value. */
  defaultValue?: number;
  onBegin?: () => void;
  onEnd?: () => void;
  disabled?: boolean;
  title?: string;
  'data-testid'?: string;
}

const DRAG_THRESHOLD = 3;

/** Infinite dragging where supported; harmless no-op elsewhere (e.g. headless tests). */
function lockPointer(element: HTMLElement) {
  try {
    const result = element.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // Pointer lock unavailable: plain pointer capture still works.
  }
}

/**
 * Precise number control. Drag horizontally anywhere on it (Shift = fine, Alt = coarse),
 * click to type a value or an expression (`*2`, `+10`, `(4+2)/3`), double-click the label
 * to reset, use arrow keys when focused.
 */
export function Slider(props: SliderProps) {
  const {
    label,
    value,
    onChange,
    min = -Infinity,
    max = Infinity,
    step = 0.01,
    precision = 2,
    unit,
    defaultValue,
    onBegin,
    onEnd,
    disabled,
  } = props;
  const softMin = props.softMin ?? (Number.isFinite(min) ? min : undefined);
  const softMax = props.softMax ?? (Number.isFinite(max) ? max : undefined);
  const range = softMin !== undefined && softMax !== undefined ? softMax - softMin : undefined;
  const dragStep = props.dragStep ?? (range ? range / 240 : step);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{
    startX: number;
    start: number;
    accumulated: number;
    moved: boolean;
    id: number;
  } | null>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = (next: number) => {
    const clamped = clamp(roundTo(next, Math.max(precision + 2, 4)), min, max);
    if (clamped !== value) onChange(clamped);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || editing || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      startX: event.clientX,
      start: value,
      accumulated: 0,
      moved: false,
      id: event.pointerId,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    const total = event.clientX - state.startX;
    if (!state.moved) {
      if (Math.abs(total) < DRAG_THRESHOLD) return;
      state.moved = true;
      onBegin?.();
      lockPointer(event.currentTarget);
    }
    const pixels = document.pointerLockElement ? event.movementX : event.movementX || 0;
    const factor = event.shiftKey ? 0.1 : event.altKey ? 10 : 1;
    state.accumulated += pixels * dragStep * factor;
    commit(state.start + state.accumulated);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.id !== event.pointerId) return;
    drag.current = null;
    if (document.pointerLockElement) document.exitPointerLock();
    if (state.moved) onEnd?.();
    else {
      setDraft(formatNumber(value, precision));
      setEditing(true);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (editing || disabled) return;
    const factor = event.shiftKey ? 0.1 : event.altKey ? 10 : 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') commit(value + step * factor);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') commit(value - step * factor);
    else if (event.key === 'Enter') {
      setDraft(formatNumber(value, precision));
      setEditing(true);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  };

  const submit = () => {
    const parsed = evaluateExpression(draft, value);
    if (parsed !== null) commit(parsed);
    setEditing(false);
  };

  const fill = range ? clamp((value - softMin!) / range, 0, 1) : null;

  return (
    <div
      className={styles.slider}
      data-disabled={disabled || undefined}
      data-editing={editing || undefined}
      tabIndex={disabled ? -1 : 0}
      role="slider"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={Number.isFinite(min) ? min : undefined}
      aria-valuemax={Number.isFinite(max) ? max : undefined}
      title={props.title}
      data-testid={props['data-testid']}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={onKeyDown}
    >
      {fill !== null && <div className={styles.fill} style={{ transform: `scaleX(${fill})` }} />}
      <span
        className={styles.label}
        onDoubleClick={(event) => {
          if (defaultValue === undefined || disabled) return;
          event.stopPropagation();
          setEditing(false);
          onChange(defaultValue);
        }}
      >
        {label}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          className={styles.input}
          value={draft}
          inputMode="decimal"
          aria-label={`${label} value`}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={submit}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') submit();
            if (event.key === 'Escape') setEditing(false);
          }}
        />
      ) : (
        <span className={styles.value}>
          {formatNumber(value, precision)}
          {unit && <span className={styles.unit}>{unit}</span>}
        </span>
      )}
    </div>
  );
}
