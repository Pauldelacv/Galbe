import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { IconButton } from './controls.tsx';
import styles from './Dialog.module.css';

export function Dialog({
  title,
  onClose,
  children,
  footer,
  width = 420,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={styles.backdrop}
      onPointerDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        className={styles.panel}
        style={{ width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        </header>
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>
  );
}
