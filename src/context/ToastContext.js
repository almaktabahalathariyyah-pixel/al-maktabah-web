'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from 'react';

const ToastContext = createContext(null);

const LIFETIME = 4000;
const MAX_VISIBLE = 3;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type, message) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      let queued = false;

      setToasts((prev) => {
        // The same message twice is noise, not feedback — keep the first.
        if (prev.some((t) => t.type === type && t.message === message)) return prev;
        queued = true;
        return [...prev, { id, type, message }].slice(-MAX_VISIBLE);
      });

      if (queued) {
        timers.current.set(id, setTimeout(() => dismiss(id), LIFETIME));
      }
      return id;
    },
    [dismiss]
  );

  // Without this a queued dismiss can fire after unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  /**
   * `toast` MUST keep a stable identity. Callers list it in effect dependency
   * arrays, so a fresh object every render turns each notification into a
   * full refetch — which is exactly what the admin desk was doing.
   */
  const toast = useMemo(
    () => ({
      success: (msg) => addToast('success', msg),
      error: (msg) => addToast('error', msg),
      info: (msg) => addToast('info', msg),
    }),
    [addToast]
  );

  const value = useMemo(
    () => ({ toast, toasts, dismiss }),
    [toast, toasts, dismiss]
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
