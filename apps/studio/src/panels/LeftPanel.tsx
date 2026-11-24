import { PRIMITIVE_KINDS, type PrimitiveKind } from '@galbe/core';
import {
  Box,
  Circle,
  Cone,
  Cylinder,
  Donut,
  Image,
  Pill,
  Shapes,
  Sparkles,
  Square,
  Type,
  Upload,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { HistoryList } from '../features/history/HistoryList.tsx';
import { LayerList } from '../features/layers/LayerList.tsx';
import { importModelFromPicker, importSvgFromPicker } from '../features/objects/importObjects.ts';
import { addText } from '../state/actions.ts';
import { addPrimitive, primitiveName } from '../state/objectActions.ts';
import { useUiStore } from '../state/uiStore.ts';
import { Segmented } from '../ui/controls.tsx';
import styles from './LeftPanel.module.css';

function Tool({
  icon,
  label,
  shortcut,
  soon,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  soon?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.tool}
      disabled={!!soon}
      data-active={active || undefined}
      onClick={onClick}
      title={soon ? `${label} — coming in ${soon}` : `${label}${shortcut ? ` — ${shortcut}` : ''}`}
      data-testid={`tool-${label.toLowerCase()}`}
    >
      {icon}
      <span>{label}</span>
      {soon && <span className={styles.soon}>{soon}</span>}
    </button>
  );
}

const PRIMITIVE_ICONS: Record<PrimitiveKind, ReactNode> = {
  sphere: <Circle />,
  roundedBox: <Square />,
  torus: <Donut />,
  capsule: <Pill />,
  cylinder: <Cylinder />,
  cone: <Cone />,
  ring: <Donut />,
  blob: <Sparkles />,
};

export function LeftPanel() {
  const [flyout, setFlyout] = useState<'primitive' | null>(null);
  const tab = useUiStore((state) => state.leftTab);
  const setTab = useUiStore((state) => state.setLeftTab);
  return (
    <aside className={styles.panel} aria-label="Tools and layers">
      <div className={styles.heading}>Add</div>
      <div className={styles.tools}>
        <Tool icon={<Type />} label="Type" shortcut="T" onClick={() => addText()} />
        <Tool
          icon={<Shapes />}
          label="Shape"
          shortcut="SVG file, or paste from Figma / Illustrator"
          onClick={() => void importSvgFromPicker()}
        />
        <Tool
          icon={<Circle />}
          label="Primitive"
          active={flyout === 'primitive'}
          onClick={() => setFlyout(flyout === 'primitive' ? null : 'primitive')}
        />
        <Tool
          icon={<Box />}
          label="Object"
          shortcut="GLB, GLTF, FBX or OBJ"
          onClick={() => void importModelFromPicker()}
        />
        <Tool icon={<Image />} label="Cover" soon="v0.3" />
        <Tool
          icon={<Upload />}
          label="Import"
          shortcut="or drop files anywhere"
          onClick={() =>
            void import('../features/objects/importObjects.ts').then((m) => m.importAnything())
          }
        />
      </div>
      {flyout === 'primitive' && (
        <div
          className={styles.flyout}
          role="group"
          aria-label="Primitives"
          data-testid="primitives"
        >
          {PRIMITIVE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={styles.flyoutItem}
              onClick={() => {
                addPrimitive(kind);
                setFlyout(null);
              }}
              data-testid={`primitive-${kind}`}
              title={primitiveName(kind)}
            >
              {PRIMITIVE_ICONS[kind]}
              <span>{primitiveName(kind)}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.tabRow}>
        <Segmented
          label="Left panel"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'layers', label: 'Layers' },
            { value: 'history', label: 'History' },
          ]}
        />
      </div>
      <div className={styles.layers}>{tab === 'layers' ? <LayerList /> : <HistoryList />}</div>
    </aside>
  );
}
