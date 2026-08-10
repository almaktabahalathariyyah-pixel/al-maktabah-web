'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './ThemeToggle.module.css';

/**
 * The theme is not this component's state — it is the `data-theme` attribute
 * on <html>, which the inline script in layout.js has already set before the
 * first paint, and which another tab can change underneath us.
 *
 * So it is read as an external store rather than copied into useState and
 * synced back with effects. That also settles the server render honestly:
 * getServerSnapshot says 'dark', the shell's default, and the attribute is
 * consulted from the first client render onward.
 */

/** Tabs that changed it themselves; `storage` only fires in the others. */
const listeners = new Set();

function subscribe(onChange) {
  const onStorage = (e) => {
    // key === null is a whole-storage clear.
    if (e.key !== 'theme' && e.key !== null) return;
    const next = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    onChange();
  };
  window.addEventListener('storage', onStorage);
  listeners.add(onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    listeners.delete(onChange);
  };
}

/** A string, so React can compare snapshots without re-rendering forever. */
const getSnapshot = () =>
  document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

/** Dark is the shell's default, and what the server markup assumes. */
const getServerSnapshot = () => 'dark';

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isDark = theme === 'dark';

  const toggle = useCallback(() => {
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable — ignore */
    }
    // This tab gets no `storage` event for its own write.
    listeners.forEach((notify) => notify());
  }, [isDark]);

  return (
    <button
      onClick={toggle}
      className={`icon-btn ${styles.toggle}`}
      title={isDark ? 'Switch to light' : 'Switch to dark'}
      aria-label="Toggle colour theme"
    >
      <span className={`${styles.icon} ${!isDark ? styles.on : ''}`}>
        <Sun size={16} />
      </span>
      <span className={`${styles.icon} ${isDark ? styles.on : ''}`}>
        <Moon size={16} />
      </span>
    </button>
  );
}
