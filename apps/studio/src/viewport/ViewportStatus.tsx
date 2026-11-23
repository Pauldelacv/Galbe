import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEngineStatus } from '../engine/studioEngine.ts';
import styles from './ViewportStatus.module.css';

export function ViewportStatus() {
  const loading = useEngineStatus((state) => state.loading);
  const errors = useEngineStatus((state) => state.errors);
  const messages = [...new Set(Object.values(errors))];
  if (!loading && !messages.length) return null;
  return (
    <div className={styles.status} role="status">
      {loading > 0 && (
        <span className={styles.item}>
          <Loader2 className={styles.spin} aria-hidden /> Loading assets…
        </span>
      )}
      {messages.map((message) => (
        <span key={message} className={styles.item} data-kind="error">
          <AlertTriangle aria-hidden /> {message}
        </span>
      ))}
    </div>
  );
}
