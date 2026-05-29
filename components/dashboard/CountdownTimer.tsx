'use client';

import { useState, useEffect } from 'react';
import styles from './CountdownTimer.module.css';

function getNextScrapeTime(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const istNow = new Date(utcMs + istOffset);

  const target = new Date(istNow);
  target.setHours(7, 0, 0, 0);

  if (istNow >= target) {
    target.setDate(target.getDate() + 1);
  }

  const targetUtcMs = target.getTime() - istOffset + now.getTimezoneOffset() * -60 * 1000;
  return new Date(targetUtcMs);
}

function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '0h 0m 0s';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

export default function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    function update() {
      const target = getNextScrapeTime();
      const diff = target.getTime() - Date.now();
      setTimeLeft(formatTimeLeft(diff));
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className={styles.wrapper}>
      <span className={styles.icon}>🔄</span>
      <span className={styles.label}>Next scrape in</span>
      <span className={styles.time}>{timeLeft}</span>
    </div>
  );
}
