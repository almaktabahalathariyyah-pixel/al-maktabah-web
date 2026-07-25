'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Library, 
  Menu, 
  Home, 
  Compass, 
  Bookmark, 
  Settings, 
  LogOut,
  User,
  Shield,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import styles from './SidebarLayout.module.css';

export default function SidebarLayout({ children }) {
  const [isOpen, setIsOpen] = useState(true);
  const pathname = usePathname();

  const toggleSidebar = () => setIsOpen(!isOpen);

  const navItems = [
    { icon: Home, label: 'Home', href: '/' },
    { icon: Compass, label: 'Discover', href: '/discover' },
    { icon: Bookmark, label: 'Saved', href: '/saved' },
  ];

  const bottomNavItems = [
    { icon: Shield, label: 'Admin', href: '/admin' },
    { icon: User, label: 'Login', href: '/login' },
  ];

  return (
    <div className={styles.layoutContainer}>
      <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
        
        <div className={styles.logoSection}>
          <div className={`${styles.logoWrapper} ${!isOpen ? styles.hideElement : ''}`}>
            <Library size={24} color="var(--accent-primary)" style={{ minWidth: '24px' }} />
            <span className={styles.logoText}>
              Al-Maktabah
            </span>
          </div>
          <button onClick={toggleSidebar} className={styles.toggleBtn} title="Toggle Sidebar">
            {isOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        <nav className={styles.navMenu}>
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                href={item.href} 
                key={item.label}
                className={`${styles.navItem} ${isActive ? styles.activeNavItem : ''} ${!isOpen ? styles.navItemClosed : ''}`}
                title={!isOpen ? item.label : ''}
              >
                <div className={styles.iconWrapper}>
                  <item.icon size={20} />
                </div>
                <span className={`${styles.navLabel} ${!isOpen ? styles.hideElement : ''}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.footerSection}>
          <div className={styles.navMenu} style={{ padding: 0 }}>
            {bottomNavItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link 
                  href={item.href} 
                  key={item.label}
                  className={`${styles.navItem} ${isActive ? styles.activeNavItem : ''} ${!isOpen ? styles.navItemClosed : ''}`}
                  title={!isOpen ? item.label : ''}
                >
                  <div className={styles.iconWrapper}>
                    <item.icon size={20} />
                  </div>
                  <span className={`${styles.navLabel} ${!isOpen ? styles.hideElement : ''}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

      </aside>

      <main className={`${styles.mainContent} ${isOpen ? styles.mainOpen : styles.mainClosed}`}>
        {children}
      </main>
    </div>
  );
}
