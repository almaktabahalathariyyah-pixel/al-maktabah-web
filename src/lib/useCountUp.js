'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Rolls a number to its new value instead of replacing it.
 *
 * Filtering the shelf swaps "441 เล่มในคลัง" for "232" between one frame and
 * the next, which is easy to miss — the chip that was pressed is at the
 * bottom of the screen and the tally is at the top. Counting draws the eye to
 * the thing that changed, which is the whole point of showing it.
 *
 * Driven by rAF rather than a CSS transition because there is no CSS property
 * here to transition: the text content itself is what changes.
 */
export function useCountUp(target, { duration = 420 } = {}) {
  const [shown, setShown] = useState(target);
  const from = useRef(target);
  const frame = useRef(null);

  useEffect(() => {
    // The first paint, and any browser told to keep still, land on the value
    // directly — an animation nobody asked for is worse than none.
    const still =
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      // A hidden tab is not painting, so its rAF callbacks never run. Without
      // this the tally would sit on its old value until the tab was looked at
      // again — a filter applied in the background would silently show the
      // wrong number.
      document.hidden;

    if (still || from.current === target) {
      from.current = target;
      setShown(target);
      return undefined;
    }

    const start = performance.now();
    const origin = from.current;
    const distance = target - origin;

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      // Fast at first, settling at the end — the same shape as --ease-out.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(origin + distance * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else from.current = target;
    };

    frame.current = requestAnimationFrame(step);

    // The backstop. rAF is the animation, not the source of truth: if those
    // callbacks are throttled or dropped — a tab put in the background
    // mid-count, a window that stops compositing — this still lands on the
    // right number. Observed while testing: with frames suspended the count
    // never advanced past its starting value at all.
    const settle = setTimeout(() => {
      from.current = target;
      setShown(target);
    }, duration + 120);

    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
      clearTimeout(settle);
      // Whatever was on screen is where the next count starts, so
      // interrupting one filter with another does not jump.
      from.current = target;
    };
  }, [target, duration]);

  return shown;
}

export default useCountUp;
