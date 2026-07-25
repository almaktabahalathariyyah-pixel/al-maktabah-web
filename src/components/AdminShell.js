'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  LayoutGrid,
  BookPlus,
  SlidersHorizontal,
  UserCheck,
  Upload,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from './AdminShell.module.css';

const ADMIN_NAV = [
  { label: 'คลังหนังสือ', href: '/admin', icon: LayoutGrid },
  { label: 'เพิ่มหนังสือ', href: '/admin/new', icon: BookPlus },
  { label: 'อนุมัติสมาชิก', href: '/admin/approvals', icon: UserCheck },
  { label: 'นำเข้า', href: '/admin/import', icon: Upload },
  { label: 'ตั้งค่าฟอร์ม', href: '/admin/fields', icon: SlidersHorizontal },
];

/**
 * Admin chrome — deliberately distinct from the reader-facing site so
 * it is never mistaken for it. Also the single access gate: every route
 * under /admin is guarded here rather than in each page.
 */
export default function AdminShell({ children }) {
  const { isAdmin, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !isAdmin) router.replace('/');
  }, [loading, isAdmin, router]);

  if (loading) {
    return <div className={styles.gate}>กำลังตรวจสอบสิทธิ์…</div>;
  }

  if (!isAdmin) {
    return <div className={styles.gate}>ไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.bar}>
        <div className={styles.barInner}>
          <div className={styles.brand}>
            <span className={styles.badge}>ADMIN</span>
            <span className={styles.brandName}>แผงควบคุม</span>
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
                >
                  <item.icon size={15} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link href="/" className={styles.exit}>
            <ArrowLeft size={15} /> กลับหน้าเว็บ
          </Link>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
