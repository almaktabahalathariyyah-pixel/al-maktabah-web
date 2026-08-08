'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Press and hold, without breaking tap, scroll or the controls inside the row.
 *
 * Four things have to be true or a long press becomes a nuisance rather than
 * a shortcut:
 *
 *   - a press that turns into a scroll is a scroll, not a hold, so any
 *     movement past a few pixels cancels it;
 *   - a press that started on a checkbox, a link or a button belongs to that
 *     control — the row must not steal it;
 *   - the click that a touch sends after the finger lifts has to be swallowed,
 *     or holding a row would also open it;
 *   - iOS puts up its own copy/share callout on a long press, which has to be
 *     suppressed on the element itself.
 *
 * Returns props to spread onto the element. `onLongPress` takes no arguments —
 * close over whatever the row is about.
 */
export function useLongPress(onLongPress, { delay = 450, moveTolerance = 10 } = {}) {
  const timer = useRef(null);
  const origin = useRef(null);
  const fired = useRef(false);

  const cancel = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    origin.current = null;
  }, []);

  // A timer left running past unmount fires into a component that is gone.
  useEffect(() => cancel, [cancel]);

  const onPointerDown = (e) => {
    // Right and middle buttons have their own meanings.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest?.('input, button, a, select, textarea, label')) return;

    fired.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    timer.current = setTimeout(() => {
      timer.current = null;
      fired.current = true;
      // A short buzz is what tells a thumb the hold registered, on the
      // devices that have it.
      try { navigator.vibrate?.(12); } catch { /* not supported */ }
      onLongPress();
    }, delay);
  };

  const onPointerMove = (e) => {
    if (!origin.current) return;
    const dx = Math.abs(e.clientX - origin.current.x);
    const dy = Math.abs(e.clientY - origin.current.y);
    if (dx > moveTolerance || dy > moveTolerance) cancel();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (e) => {
      // Both the desktop menu and the iOS callout come through here.
      if (fired.current || timer.current) e.preventDefault();
    },
    onClickCapture: (e) => {
      if (!fired.current) return;
      fired.current = false;
      e.preventDefault();
      e.stopPropagation();
    },
  };
}

export default useLongPress;
