'use client';

import { Save } from 'lucide-react';
import styles from './UnsavedBar.module.css';

/**
 * The tray that appears the moment a screen has edits that are only in the
 * browser, and stays until they are saved or thrown away.
 *
 * It exists because the save button used to sit in the page header: on a
 * phone it scrolls out of sight after the first two rows of a list, so
 * editing forty names looked exactly like editing forty names that had
 * already been saved. Being fixed to the bottom is the whole point — the
 * button is under the thumb no matter how far down the page the work is.
 */
export default function UnsavedBar({
  show,
  label = 'ยังไม่ได้บันทึก',
  detail,
  saving = false,
  onSave,
  onDiscard,
  saveLabel = 'บันทึกการเปลี่ยนแปลง',
  // Two buttons and the full Thai label do not fit across a 375px phone —
  // measured, the label ran 16px past its own button and squashed the icon
  // to nothing. The row above already says what is unsaved, so the button
  // only has to say what pressing it does.
  saveLabelShort = 'บันทึก',
  discardLabel = 'ทิ้งการแก้ไข',
}) {
  if (!show) return null;

  return (
    <div className={styles.bar} role="status" aria-live="polite">
      <span className={styles.note}>
        <span className={styles.dot} aria-hidden="true" />
        {label}
        {detail && <span className={styles.detail}>{detail}</span>}
      </span>

      <div className={styles.acts}>
        {onDiscard && (
          <button type="button" className={`btn ${styles.quiet}`} onClick={onDiscard} disabled={saving}>
            {discardLabel}
          </button>
        )}
        <button type="button" className="btn btn-solid" onClick={onSave} disabled={saving}>
          <Save size={16} className={styles.icon} />
          {saving ? (
            <span>กำลังบันทึก…</span>
          ) : (
            <>
              <span className={styles.wide}>{saveLabel}</span>
              <span className={styles.narrow}>{saveLabelShort}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
