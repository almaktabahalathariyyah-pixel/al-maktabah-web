'use client';

import { useToast } from '../context/ToastContext';
import styles from './Toast.module.css';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
};

export default function Toast() {
  const { toasts, dismiss } = useToast();

  return (
    <div
      className={styles.container}
      role="region"
      aria-label="การแจ้งเตือน"
      aria-live="polite"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        return (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.type]}`}
            role={toast.type === 'error' ? 'alert' : 'status'}
          >
            <span className={styles.icon}>
              <Icon size={18} />
            </span>
            <div className={styles.message}>{toast.message}</div>
            <button
              className={styles.close}
              onClick={() => dismiss(toast.id)}
              aria-label="ปิดการแจ้งเตือน"
            >
              <X size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
