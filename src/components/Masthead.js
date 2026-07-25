'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import styles from './Masthead.module.css';

const NAV = [
  { label: 'หน้าหลัก', href: '/' },
  { label: 'บันทึกไว้', href: '/saved' },
  { label: 'บัญชี', href: '/account' },
  { label: 'เกี่ยวกับ', href: '/about' },
];

export default function Masthead({ children }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();

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
            {isAdmin && (
              <Link
                href="/admin"
                className={`${styles.navLink} ${pathname === '/admin' ? styles.navActive : ''}`}
              >
                ผู้ดูแลระบบ
              </Link>
            )}
          </nav>

          <div className={styles.tools}>
            <ThemeToggle />
            
            {user ? (
              <div className={styles.userMenu}>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName} className={styles.avatar} />
                ) : (
                  <div className={styles.avatarFallback}>{user.email?.charAt(0).toUpperCase()}</div>
                )}
                <button onClick={logout} className={styles.logoutBtn} title="ออกจากระบบ">
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link href="/login" className={styles.signIn}>
                เข้าสู่ระบบ
              </Link>
            )}

            <button
              className={styles.menuBtn}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
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
            {isAdmin && (
              <Link
                href="/admin"
                className={styles.drawerLink}
                onClick={() => setOpen(false)}
              >
                ผู้ดูแลระบบ
              </Link>
            )}
            
            {user ? (
              <button onClick={() => { logout(); setOpen(false); }} className={styles.drawerLink} style={{textAlign: 'left', width: '100%'}}>
                ออกจากระบบ
              </button>
            ) : (
              <Link href="/login" className={styles.drawerLink} onClick={() => setOpen(false)}>
                เข้าสู่ระบบ
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className={styles.body}>{children}</div>

      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>Al-Maktabah Al-Athariyyah</span>
          <span className={styles.footerNote}>
            จัดเก็บไฟล์ผ่านระบบ{' '}
            {process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL ? (
              <a href={process.env.NEXT_PUBLIC_TELEGRAM_CHANNEL_URL} target="_blank" rel="noopener noreferrer" className="tlink">
                Telegram
              </a>
            ) : (
              'Telegram'
            )}
          </span>
        </div>
      </footer>
    </>
  );
}
