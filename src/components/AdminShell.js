'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LayoutGrid,
  UserCheck,
  Upload,
  Settings,
  SlidersHorizontal,
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAdmin } from '@/context/AdminContext';
import SettingsPanel from './SettingsPanel';
import FieldsPanel from './FieldsPanel';
import styles from './AdminShell.module.css';

const ADMIN_NAV = [
  { label: 'คลังหนังสือ', href: '/admin', icon: LayoutGrid },
  { label: 'อนุมัติสมาชิก', href: '/admin/approvals', icon: UserCheck },
];

export default function AdminShell({ children }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  
  const {
    isSidebarOpen,
    toggleSidebar,
    isSettingsOpen,
    openSettings,
    closeSettings,
    isFieldsOpen,
    openFields,
    closeFields,
  } = useAdmin();

  // Used to prevent hydration mismatch for window.innerWidth
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/');
  }, [loading, isAdmin, router]);

  if (loading || !mounted) {
    return <div className={styles.gate}>กำลังตรวจสอบสิทธิ์…</div>;
  }

  if (!isAdmin) {
    return <div className={styles.gate}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }

  return (
    <div className={styles.shell}>
      {/* Mobile Header */}
      <div className={styles.mobileHeader}>
        <button onClick={toggleSidebar} className={styles.menuBtn}>
          <Menu size={20} />
        </button>
        <div className={styles.brand}>
          <span className={styles.badge}>ADMIN</span>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        <div className={styles.sidebarHeader}>
          <div className={styles.brand}>
            <span className={styles.badge}>ADMIN</span>
            <span className={styles.brandName}>แผงควบคุม</span>
          </div>
          <button onClick={toggleSidebar} className={styles.closeBtnMobile}>
            <X size={20} />
          </button>
          <button onClick={toggleSidebar} className={styles.toggleBtnDesktop} title={isSidebarOpen ? 'หุบเมนู' : 'ขยายเมนู'}>
            {isSidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className={styles.nav}>
          {ADMIN_NAV.map((item) => {
            const active =
              item.href === '/admin'
                ? pathname === '/admin'
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navActive : ''}`}
                title={!isSidebarOpen ? item.label : undefined}
                onClick={() => {
                  if (window.innerWidth <= 900) toggleSidebar();
                }}
              >
                <item.icon size={18} className={styles.navIcon} />
                <span className={styles.navText}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        
        <div className={styles.navDivider} />
        
        <div className={styles.settingsNav}>
          <Link href="/admin/names" className={styles.navLink} title={!isSidebarOpen ? 'จัดการรายชื่อ' : undefined} onClick={() => { if (window.innerWidth <= 900) toggleSidebar(); }}>
            <UserCheck size={18} className={styles.navIcon} /> <span className={styles.navText}>จัดการรายชื่อ</span>
          </Link>
          <button onClick={openFields} className={styles.navLink} title={!isSidebarOpen ? 'ตั้งค่าฟิลด์' : undefined}>
            <SlidersHorizontal size={18} className={styles.navIcon} /> <span className={styles.navText}>ตั้งค่าฟิลด์</span>
          </button>
          <button onClick={openSettings} className={styles.navLink} title={!isSidebarOpen ? 'ตั้งค่าหมวดหมู่' : undefined}>
            <Settings size={18} className={styles.navIcon} /> <span className={styles.navText}>ตั้งค่าหมวดหมู่</span>
          </button>
        </div>

        <div className={styles.bottomNav}>
          <Link href="/" className={styles.exit} title={!isSidebarOpen ? 'กลับหน้าเว็บ' : undefined}>
            <ArrowLeft size={18} className={styles.navIcon} /> <span className={styles.navText}>กลับหน้าเว็บ</span>
          </Link>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>

      <SettingsPanel isOpen={isSettingsOpen} onClose={closeSettings} />
      <FieldsPanel isOpen={isFieldsOpen} onClose={closeFields} />

      {/* Mobile Backdrop */}
      {isSidebarOpen && window.innerWidth <= 900 && (
        <div className={styles.backdrop} onClick={toggleSidebar} />
      )}
    </div>
  );
}
