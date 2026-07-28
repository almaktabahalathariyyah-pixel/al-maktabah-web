'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
} from 'react';

const ConfirmContext = createContext(null);

/**
 * The app's own confirmation dialog, in place of window.confirm/alert.
 *
 * The native dialogs had to go for three reasons: they are unstyled in a
 * deliberately dark shell, they cannot show Thai copy over more than a couple
 * of lines without looking broken, and on iOS they can be suppressed entirely
 * — which silently turned "ยืนยันลบ?" into an unconditional delete.
 *
 * Both entry points return a promise, so a caller reads the same way it did
 * with confirm():
 *
 *   if (!(await confirm({ message: 'ยืนยันลบ?' }))) return;
 *
 * `ask` is the multi-choice form, for the cases where "yes/no" was hiding a
 * third answer the owner actually needed.
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  /** Settles the open dialog with `value` and takes it off screen. */
  const settle = useCallback((value) => {
    const resolve = resolver.current;
    resolver.current = null;
    setDialog(null);
    resolve?.(value);
  }, []);

  const ask = useCallback((options) => {
    // A second dialog while one is open would orphan the first promise.
    resolver.current?.(null);

    return new Promise((resolve) => {
      resolver.current = resolve;
      setDialog({
        title: options?.title || 'ยืนยันการดำเนินการ',
        message: options?.message || '',
        actions: options?.actions || [],
        cancelLabel: options?.cancelLabel || 'ยกเลิก',
        tone: options?.tone || 'default',
      });
    });
  }, []);

  const confirm = useCallback(
    async (options) => {
      const answer = await ask({
        ...options,
        actions: [
          {
            key: 'confirm',
            label: options?.confirmLabel || 'ยืนยัน',
            tone: options?.tone || 'default',
          },
        ],
      });
      return answer === 'confirm';
    },
    [ask]
  );

  /** Same stable-identity rule as the toast API — callers put these in deps. */
  const value = useMemo(
    () => ({ confirm, ask, dialog, settle }),
    [confirm, ask, dialog, settle]
  );

  return <ConfirmContext.Provider value={value}>{children}</ConfirmContext.Provider>;
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context;
}
