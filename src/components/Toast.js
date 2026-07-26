'use client';

import { useToast } from '../context/ToastContext';
import styles from './Toast.module.css';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export default function Toast() {
  const { toasts, setToasts } = useToast();

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          <div className={styles.icon}>
            {toast.type === 'success' && <CheckCircle size={20} />}
            {toast.type === 'error' && <AlertTriangle size={20} />}
            {toast.type === 'info' && <Info size={20} />}
          </div>
          <div className={styles.message}>{toast.message}</div>
          <button className={styles.close} onClick={() => removeToast(toast.id)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
