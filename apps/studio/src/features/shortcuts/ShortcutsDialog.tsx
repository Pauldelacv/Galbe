import type { Hotkey } from '../../lib/hotkeys.ts';
import { useUiStore } from '../../state/uiStore.ts';
import { Kbd } from '../../ui/controls.tsx';
import { Dialog } from '../../ui/Dialog.tsx';
import styles from './ShortcutsDialog.module.css';

const SLIDER_TIPS: [string, string][] = [
  ['Drag', 'Change a value'],
  ['⇧ Drag', 'Fine adjustment (×0.1)'],
  ['⌥ Drag', 'Coarse adjustment (×10)'],
  ['Click', 'Type a value or expression (*2, +10…)'],
  ['Double-click label', 'Reset to default'],
];

export function ShortcutsDialog({ hotkeys }: { hotkeys: Hotkey[] }) {
  const groups = [...new Set(hotkeys.map((hotkey) => hotkey.group))];
  return (
    <Dialog
      title="Keyboard shortcuts"
      onClose={() => useUiStore.getState().openDialog(null)}
      width={520}
    >
      <div className={styles.columns}>
        {groups.map((group) => (
          <section key={group}>
            <h3 className={styles.group}>{group}</h3>
            {hotkeys
              .filter((hotkey) => hotkey.group === group)
              .map((hotkey) => (
                <div key={hotkey.id} className={styles.row}>
                  <span>{hotkey.description}</span>
                  <span className={styles.keys}>
                    {hotkey.keys.map((value) => (
                      <Kbd key={value}>{value}</Kbd>
                    ))}
                  </span>
                </div>
              ))}
          </section>
        ))}
        <section>
          <h3 className={styles.group}>Sliders</h3>
          {SLIDER_TIPS.map(([keys, description]) => (
            <div key={keys} className={styles.row}>
              <span>{description}</span>
              <span className={styles.keys}>
                <Kbd>{keys}</Kbd>
              </span>
            </div>
          ))}
        </section>
      </div>
    </Dialog>
  );
}
