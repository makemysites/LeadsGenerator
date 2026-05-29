'use client';

import type { DashboardStats } from '@/types';
import styles from './StatCards.module.css';

interface StatCardsProps {
  stats: DashboardStats | null;
}

export default function StatCards({ stats }: StatCardsProps) {
  const cards = [
    {
      icon: '🆕',
      iconClass: styles.iconPurple,
      value: stats?.todayCount ?? '-',
      label: "Today's New Leads",
    },
    {
      icon: '📞',
      iconClass: styles.iconBlue,
      value: stats?.toCall ?? '-',
      label: 'To Call',
    },
    {
      icon: '✅',
      iconClass: styles.iconGreen,
      value: stats?.called ?? '-',
      label: 'Called',
    },
    {
      icon: '⏰',
      iconClass: styles.iconAmber,
      value: stats?.followUpToday ?? '-',
      label: 'Follow-Ups Today',
    },
  ];

  return (
    <div className={styles.grid}>
      {cards.map((card) => (
        <div key={card.label} className={styles.card}>
          <div className={`${styles.icon} ${card.iconClass}`}>{card.icon}</div>
          <div className={styles.content}>
            <div className={styles.value}>{card.value}</div>
            <div className={styles.label}>{card.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
