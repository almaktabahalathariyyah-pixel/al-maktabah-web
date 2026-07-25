'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import styles from './ThemeToggle.module.css';

/**
 * Light/dark switch. The first paint is handled by the inline script in
 * layout.js, so there is no flash of the wrong palette before hydration.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState(null);

  useEffect(() => {
    // Dark is the default shell; light only when explicitly chosen.
    setTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('theme', next);
    } catch {
      /* storage unavailable — ignore */
    }
  };

  const isDark = theme === 'dark';

  return (
    <button
      onClick={toggle}
      className={styles.toggle}
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
