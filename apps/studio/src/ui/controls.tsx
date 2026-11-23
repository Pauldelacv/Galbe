import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import { forwardRef } from 'react';
import styles from './controls.module.css';

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    icon?: ReactNode;
    size?: 'sm' | 'md';
  }
>(function Button({ variant = 'default', icon, size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={[styles.button, className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; size?: 'sm' | 'md' }
>(function IconButton({ label, active, size = 'md', className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={rest.title ?? label}
      aria-pressed={active}
      className={[styles.iconButton, className].filter(Boolean).join(' ')}
      data-active={active || undefined}
      data-size={size}
      {...rest}
    >
      {children}
    </button>
  );
});

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  title?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div className={styles.segmented} role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          className={styles.segment}
          data-active={option.value === value || undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hideLabel,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hideLabel?: boolean;
}) {
  return (
    <label className={styles.toggle}>
      {!hideLabel && <span className={styles.toggleLabel}>{label}</span>}
      <input
        type="checkbox"
        className={styles.toggleInput}
        checked={checked}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.toggleTrack} aria-hidden />
    </label>
  );
}

export function Select({
  label,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <div className={[styles.selectWrap, className].filter(Boolean).join(' ')}>
      <select aria-label={label} className={styles.select} {...rest}>
        {children}
      </select>
    </div>
  );
}

/** A labelled row: label on the left, control(s) on the right. */
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className={styles.field} title={hint}>
      <span className={styles.fieldLabel}>{label}</span>
      <div className={styles.fieldControl}>{children}</div>
    </div>
  );
}

export function Stack({ children, gap = 'sm' }: { children: ReactNode; gap?: 'sm' | 'md' }) {
  return (
    <div className={styles.stack} data-gap={gap}>
      {children}
    </div>
  );
}

export function Grid({ children, columns = 3 }: { children: ReactNode; columns?: number }) {
  return (
    <div
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className={styles.kbd}>{children}</kbd>;
}
