'use client';

import styles from './ApiUsageMeter.module.css';

interface ApiUsageMeterProps {
  callsMade: number;
  dailyLimit: number;
}

function getBarColor(percent: number): string {
  if (percent >= 90) return '#DC2626';
  if (percent >= 80) return '#EA580C';
  if (percent >= 60) return '#D97706';
  return '#16A34A';
}

export default function ApiUsageMeter({ callsMade, dailyLimit }: ApiUsageMeterProps) {
  const percent = dailyLimit > 0 ? Math.round((callsMade / dailyLimit) * 100) : 0;

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span className={styles.label}>Foursquare API Calls Today</span>
        <span className={styles.count}>
          {callsMade} / {dailyLimit} ({percent}%)
        </span>
      </div>
      <div className={styles.bar}>
        <div
          className={styles.fill}
          style={{
            width: `${Math.min(percent, 100)}%`,
            background: getBarColor(percent),
          }}
        />
      </div>
    </div>
  );
}
