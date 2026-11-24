import { Circle, CircleDot } from 'lucide-react';
import { useDocumentStore } from '../../state/documentStore.ts';
import styles from './HistoryList.module.css';

/** Undo history: click an entry to go back (or forward) to that state. */
export function HistoryList() {
  const past = useDocumentStore((state) => state.past);
  const future = useDocumentStore((state) => state.future);
  const step = useDocumentStore((state) => state.step);
  if (!past.length && !future.length) {
    return <p className={styles.empty}>No edits yet. Every change you make is listed here.</p>;
  }
  // Each entry's label describes the edit that leads *away* from its snapshot.
  return (
    <ol className={styles.list} aria-label="History" data-testid="history">
      <li>
        <button
          type="button"
          className={styles.row}
          data-current={past.length === 0 || undefined}
          onClick={() => step(-past.length)}
        >
          <Circle aria-hidden />
          Opened
        </button>
      </li>
      {past.map((entry, index) => (
        <li key={`p${index}`}>
          <button
            type="button"
            className={styles.row}
            data-current={index === past.length - 1 || undefined}
            onClick={() => step(index + 1 - past.length)}
          >
            {index === past.length - 1 ? <CircleDot aria-hidden /> : <Circle aria-hidden />}
            {entry.label}
          </button>
        </li>
      ))}
      {future.map((entry, index) => (
        <li key={`f${index}`}>
          <button type="button" className={styles.row} data-future onClick={() => step(index + 1)}>
            <Circle aria-hidden />
            {entry.label}
          </button>
        </li>
      ))}
    </ol>
  );
}
