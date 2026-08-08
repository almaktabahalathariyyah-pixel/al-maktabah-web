'use client';

import { useEffect } from 'react';

/**
 * Holds a screen still while it has work that is only in the browser.
 *
 * Every editor in the admin saves on a button press, but nothing said so —
 * an edit looked identical whether it had reached Firestore or not, which
 * reads as autosave until the afternoon's work is gone. Telling the owner
 * costs a bar on screen; catching the ways out costs this.
 *
 * Two exits are covered:
 *   - closing or reloading the tab, via the browser's own prompt;
 *   - following a link inside the app, which in the App Router never touches
 *     the browser's prompt at all — the admin sidebar is one click from every
 *     one of these screens, so this is the exit that actually gets taken.
 *
 * The back gesture is NOT covered. Cancelling a popstate means pushing a
 * decoy entry onto the history stack and unwinding it later, and a history
 * stack that lies is a worse failure than the one being prevented.
 *
 * `onLeave` receives the href that was blocked, so the caller can ask and
 * then continue there. It has to keep a stable identity — put it in a
 * useCallback — or the listener is torn down and rebuilt every render.
 */
export function useUnsavedGuard(dirty, onLeave) {
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !onLeave) return undefined;

    const intercept = (e) => {
      // Anything the owner did deliberately to open elsewhere — middle click,
      // ctrl-click, a download — leaves this screen where it is, so there is
      // nothing to protect.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;

      const next = new URL(link.href, window.location.href);
      if (next.origin !== window.location.origin) return;
      // A link back to this same screen changes nothing worth asking about.
      if (next.pathname === window.location.pathname && next.search === window.location.search) return;

      // Capture phase, so this runs before Link's own handler starts the
      // navigation — stopping it afterwards is not possible.
      e.preventDefault();
      e.stopPropagation();
      onLeave(`${next.pathname}${next.search}${next.hash}`);
    };

    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [dirty, onLeave]);
}

export default useUnsavedGuard;
