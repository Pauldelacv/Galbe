import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import styles from './Section.module.css';

const STORAGE_KEY = 'galbe:sections';

function readOpen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Collapsible inspector section. Open state persists per `id` across sessions. */
export function Section({
  id,
  title,
  children,
  actions,
  defaultOpen = true,
}: {
  id: string;
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(() => readOpen()[id] ?? defaultOpen);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...readOpen(), [id]: next }));
    } catch {
      // Storage unavailable (private mode): keep state in memory only.
    }
  };
  return (
    <section className={styles.section} data-open={open || undefined}>
      <header className={styles.header}>
        <button type="button" className={styles.title} onClick={toggle} aria-expanded={open}>
          <ChevronDown className={styles.chevron} aria-hidden />
          {title}
        </button>
        {actions && <div className={styles.actions}>{actions}</div>}
      </header>
      {open && <div className={styles.body}>{children}</div>}
    </section>
  );
}
