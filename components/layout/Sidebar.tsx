'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './Sidebar.module.css';

interface NavItem {
  icon: string;
  label: string;
  href: string;
}

const NAV_ITEMS: NavItem[] = [
  { icon: '📊', label: 'Dashboard', href: '/' },
  { icon: '📞', label: 'To Call', href: '/to-call' },
  { icon: '✅', label: 'Called', href: '/called' },
  { icon: '⏰', label: 'Follow-Ups', href: '/follow-ups' },
  { icon: '❌', label: 'Rejected', href: '/rejected' },
  { icon: '⚙️', label: 'Settings', href: '/settings' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🩺</span>
        <span className={styles.logoText}>DocLeads</span>
      </div>
      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={styles.footer}>DocLeads CRM v1.0</div>
    </aside>
  );
}
