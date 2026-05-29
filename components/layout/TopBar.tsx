'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './TopBar.module.css';

interface ApiUsage {
  calls_made: number;
  daily_limit: number;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/to-call': 'To Call',
  '/called': 'Called',
  '/follow-ups': 'Follow-Ups',
  '/rejected': 'Rejected',
  '/settings': 'Settings',
};

function getBarColor(percent: number): string {
  if (percent >= 90) return '#DC2626';
  if (percent >= 80) return '#EA580C';
  if (percent >= 60) return '#D97706';
  return '#16A34A';
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TopBar() {
  const pathname = usePathname();
  const [apiUsage, setApiUsage] = useState<ApiUsage | null>(null);

  useEffect(() => {
    async function fetchUsage() {
      try {
        const res = await fetch('/api/stats');
        if (res.ok) {
          const data = await res.json();
          setApiUsage(data.apiUsageToday);
        }
      } catch {
        // silently fail
      }
    }
    fetchUsage();
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, []);

  const title = PAGE_TITLES[pathname] || 'DocLeads';
  const percent = apiUsage ? Math.round((apiUsage.calls_made / apiUsage.daily_limit) * 100) : 0;

  return (
    <div className={styles.topbar}>
      <h1 className={styles.pageTitle}>{title}</h1>
      <div className={styles.right}>
        {apiUsage && (
          <div className={styles.apiMeter}>
            <span>API: {apiUsage.calls_made}/{apiUsage.daily_limit}</span>
            <div className={styles.apiBar}>
              <div
                className={styles.apiFill}
                style={{
                  width: `${Math.min(percent, 100)}%`,
                  background: getBarColor(percent),
                }}
              />
            </div>
          </div>
        )}
        <span className={styles.date}>{formatDate(new Date())}</span>
      </div>
    </div>
  );
}
