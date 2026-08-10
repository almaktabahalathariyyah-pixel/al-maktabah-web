'use client';

import { useEffect } from 'react';

/**
 * One owner for `body { overflow: hidden }`, counted.
 *
 * Seven components used to set that property directly, in two protocols that
 * cannot be mixed. Five did "hidden while I am open, empty string otherwise";
 * two saved the value they found and put it back on close. Interleave them and
 * the lock leaks:
 *
 *   1. the book form opens          → body: hidden
 *   2. a confirm dialog opens on it → saves "hidden" as the value to restore
 *   3. the form closes              → body: ""       (background scrolls again)
 *   4. the dialog closes            → body: hidden   ← nothing is open
 *
 * A stuck `overflow: hidden` on body is not a cosmetic problem here. It makes
 * body a scroll container, and a scroll container between a sticky element and
 * the viewport is what `position: sticky` resolves against — so the admin
 * sidebar stopped sticking and scrolled off the top of the page, leaving only
 * its last link on screen. globals.css already carries this warning about the
 * stylesheet's own overflow; this is the same trap sprung from JavaScript.
 *
 * Counting fixes the interleaving: the lock goes on when the first holder takes
 * it, and comes off only when the last one lets go. Order no longer matters.
 */
let holders = 0;

export function lockBodyScroll() {
  holders += 1;
  if (holders === 1) document.body.style.overflow = 'hidden';
}

export function unlockBodyScroll() {
  // Guarded, so a stray release cannot drive the count negative and strand the
  // next real lock.
  if (holders === 0) return;
  holders -= 1;
  if (holders === 0) document.body.style.overflow = '';
}

/** Holds the lock for as long as `active` is true, and releases on unmount. */
export function useBodyScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    lockBodyScroll();
    return unlockBodyScroll;
  }, [active]);
}
