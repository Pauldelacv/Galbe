import { Box, Image, Shapes, Type } from 'lucide-react';
import type { ReactNode } from 'react';
import { LayerList } from '../features/layers/LayerList.tsx';
import { addText } from '../state/actions.ts';
import styles from './LeftPanel.module.css';

function Tool({
  icon,
  label,
  shortcut,
  soon,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  soon?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tool}
      disabled={!!soon}
      onClick={onClick}
      title={soon ? `${label} — coming in ${soon}` : `${label}${shortcut ? ` (${shortcut})` : ''}`}
      data-testid={`tool-${label.toLowerCase()}`}
    >
      {icon}
      <span>{label}</span>
      {soon && <span className={styles.soon}>{soon}</span>}
    </button>
  );
}

export function LeftPanel() {
  return (
    <aside className={styles.panel} aria-label="Tools and layers">
      <div className={styles.heading}>Add</div>
      <div className={styles.tools}>
        <Tool icon={<Type />} label="Type" shortcut="T" onClick={() => addText()} />
        <Tool icon={<Shapes />} label="Shape" soon="v0.2" />
        <Tool icon={<Box />} label="Object" soon="v0.2" />
        <Tool icon={<Image />} label="Cover" soon="v0.3" />
      </div>
      <div className={styles.heading}>Layers</div>
      <div className={styles.layers}>
        <LayerList />
      </div>
    </aside>
  );
}
