'use client';

import { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';
import styles from './ConfirmDialog.module.css';

/**
 * Renders whatever `ConfirmProvider` currently has pending. Mounted once, at
 * the root, so it sits above every slide-over panel that raises it.
 */
export default function ConfirmDialog() {
  const { dialog, settle } = useConfirm();
  const firstActionRef = useRef(null);

  // Escape cancels, and the page behind must not scroll under the dialog.
  useEffect(() => {
    if (!dialog) return;

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(null);
      }
    };
    document.addEventListener('keydown', onKey);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Returning focus is handled by the browser once the button unmounts; what
    // matters here is that the keyboard starts inside the dialog, not behind it.
    firstActionRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [dialog, settle]);

  if (!dialog) return null;

  const danger = dialog.tone === 'danger';
  const Icon = danger ? AlertTriangle : HelpCircle;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        // Only a click on the backdrop itself dismisses.
        if (e.target === e.currentTarget) settle(null);
      }}
    >
      <div
        className={styles.panel}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={dialog.message ? 'confirm-message' : undefined}
      >
        <div className={`${styles.icon} ${danger ? styles.iconDanger : ''}`}>
          <Icon size={20} />
        </div>

        <h2 className={styles.title} id="confirm-title">{dialog.title}</h2>

        {dialog.message && (
          <p className={styles.message} id="confirm-message">{dialog.message}</p>
        )}

        <div className={styles.actions}>
          {dialog.actions.map((action, index) => (
            <button
              key={action.key}
              ref={index === 0 ? firstActionRef : undefined}
              type="button"
              className={`btn btn-solid ${action.tone === 'danger' ? styles.danger : ''}`}
              onClick={() => settle(action.key)}
            >
              {action.label}
            </button>
          ))}
          <button type="button" className="btn" onClick={() => settle(null)}>
            {dialog.cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
