'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import styles from './MobileNav.module.css';

interface NavItem {
  icon: string;
  label: string;
  href: string;
}

const MAIN_ITEMS: NavItem[] = [
  { icon: '📊', label: 'Dashboard', href: '/' },
  { icon: '📞', label: 'To Call', href: '/to-call' },
  { icon: '⏰', label: 'Follow-Ups', href: '/follow-ups' },
  { icon: '✅', label: 'Called', href: '/called' },
];

const MORE_ITEMS: NavItem[] = [
  { icon: '❌', label: 'Rejected', href: '/rejected' },
  { icon: '⚙️', label: 'Settings', href: '/settings' },
];

export default function MobileNav() {
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShowMore(false);
  }, [pathname]);

  const isMoreActive = MORE_ITEMS.some((item) => pathname === item.href);

  return (
    <div className={styles.mobileNav}>
      <div className={styles.navItems}>
        {MAIN_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navItem} ${pathname === item.href ? styles.navItemActive : ''}`}
          >
            <span className={styles.navIcon}>{item.icon}</span>
            <span className={styles.navLabel}>{item.label}</span>
          </Link>
        ))}
        <div ref={moreRef} style={{ position: 'relative' }}>
          <button
            className={`${styles.navItem} ${isMoreActive ? styles.navItemActive : ''}`}
            onClick={() => setShowMore((p) => !p)}
          >
            <span className={styles.navIcon}>•••</span>
            <span className={styles.navLabel}>More</span>
          </button>
          {showMore && (
            <>
              <div className={styles.popoverBackdrop} onClick={() => setShowMore(false)} />
              <div className={styles.popover}>
                {MORE_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={styles.popoverItem}
                    onClick={() => setShowMore(false)}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
