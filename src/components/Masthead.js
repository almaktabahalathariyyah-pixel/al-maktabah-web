'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Menu, X, LogOut } from 'lucide-react';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../context/AuthContext';
import styles from './Masthead.module.css';

const NAV = [
  { label: 'หน้าหลัก', href: '/' },
  { label: 'แหล่งหนังสืออื่นๆ', href: '/sources' },
  { label: 'เกี่ยวกับ', href: '/about' },
];

export default function Masthead({ children }) {
  const [open, setOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const pathname = usePathname();
  const { user, isAdmin, logout } = useAuth();
  const dropRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    }
    function handleEscape(e) {
      if (e.key !== 'Escape') return;
      setDropOpen(false);
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Navigating away should never leave a menu hanging open behind the page.
  useEffect(() => {
    setDropOpen(false);
    setOpen(false);
  }, [pathname]);

  // The mobile drawer covers the page; the page behind it must not scroll.
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header className={styles.masthead}>
        <div className={`container ${styles.inner}`}>
          <Link href="/" className={styles.wordmark}>
            {/* alt is empty on purpose: the name sits right beside it, and a
                screen reader announcing the library twice helps nobody. */}
            <Image src="/mark.png" alt="" width={36} height={36} className={styles.mark} priority />
            <span className={styles.wordmarkText}>
              <span className={styles.wordmarkMain}>Al-Maktabah</span>
              <span className={styles.wordmarkSub}>Al-Athariyyah</span>
            </span>
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
            
            {user ? (
              <div className={styles.userMenu} ref={dropRef}>
                <button
                  className={`icon-btn ${styles.avatarBtn}`}
                  onClick={() => setDropOpen((v) => !v)}
                  aria-label="เมนูผู้ใช้"
                  aria-expanded={dropOpen}
                  aria-haspopup="menu"
                >
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.photoURL} alt="" className={styles.avatar} />
                  ) : (
                    <div className={styles.avatarFallback}>{user.email?.charAt(0).toUpperCase()}</div>
                  )}
                </button>
                {dropOpen && (
                  <div className={styles.dropdown}>
                    <div className={styles.dropdownInfo}>
                      <div className={styles.dropdownName}>{user.displayName || 'ผู้ใช้'}</div>
                      <div className={styles.dropdownEmail}>{user.email}</div>
                    </div>
                    <div className={styles.dropdownDivider} />
                    {isAdmin && (
                      <Link href="/admin" className={styles.dropdownItem} onClick={() => setDropOpen(false)}>ผู้ดูแลระบบ</Link>
                    )}
                    <Link href="/account" className={styles.dropdownItem} onClick={() => setDropOpen(false)}>บัญชี</Link>
                    <Link href="/saved" className={styles.dropdownItem} onClick={() => setDropOpen(false)}>บันทึกไว้</Link>
                    <div className={styles.dropdownDivider} />
                    <button onClick={() => { logout(); setDropOpen(false); }} className={styles.dropdownItem}>
                      ออกจากระบบ
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login" className={styles.signIn}>
                เข้าสู่ระบบ
              </Link>
            )}

            <button
              className={`icon-btn ${styles.menuBtn}`}
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
              aria-expanded={open}
            >
              {open ? <X size={19} /> : <Menu size={19} />}
            </button>
          </div>
        </div>

        {/* Mobile drawer backdrop */}
        {open && <div className={styles.backdrop} onClick={() => setOpen(false)} />}
        
        {/* Mobile drawer */}
        <div className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}>
          <div className={styles.drawerHeader}>
            <button onClick={() => setOpen(false)} className="icon-btn" aria-label="ปิดเมนู">
              <X size={20} />
            </button>
          </div>
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
            {user && (
              <>
                <Link href="/saved" className={styles.drawerLink} onClick={() => setOpen(false)}>บันทึกไว้</Link>
                <Link href="/account" className={styles.drawerLink} onClick={() => setOpen(false)}>บัญชี</Link>
              </>
            )}
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

      {/* Where the bytes happen to live is our problem, not the reader's — the
          footer points at the library instead. */}
      <footer className={styles.footer}>
        <div className={`container ${styles.footerInner}`}>
          <span>Al-Maktabah Al-Athariyyah</span>
          <span className={styles.footerLinks}>
            <Link href="/about" className="tlink">เกี่ยวกับคลัง</Link>
            <Link href="/sources" className="tlink">แหล่งหนังสืออื่นๆ</Link>
          </span>
        </div>
      </footer>
    </>
  );
}
