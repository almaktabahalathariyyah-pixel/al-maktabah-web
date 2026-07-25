'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import styles from './Masthead.module.css';

const NAV = [
  { label: 'Collection', href: '/' },
  { label: 'Saved', href: '/saved' },
  { label: 'Admin', href: '/admin' },
];

export default function Masthead({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <>
      <header className={styles.masthead}>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.wordmark}>
            <span className={styles.wordmarkMain}>Al-Maktabah</span>
            <span className={styles.wordmarkSub}>Al-Athariyyah</span>
          </Link>

          <nav className={styles.nav}>
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${pathname === item.href ? styles.navActive : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.tools}>
            <ThemeToggle />
            <Link href="/login" className={styles.signIn}>
              Sign in
            </Link>
            <button
              className={styles.menuBtn}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'Close menu' : 'Open menu'}
              aria-expanded={open}
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
          <div className="container">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={styles.drawerLink}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link href="/login" className={styles.drawerLink} onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <div className={styles.body}>{children}</div>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>Al-Maktabah Al-Athariyyah</span>
          <span className={styles.footerNote}>
            Files delivered privately via Telegram
          </span>
        </div>
      </footer>
    </>
  );
}
