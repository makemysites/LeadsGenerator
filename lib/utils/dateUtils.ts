const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // +5:30 in milliseconds

/**
 * Returns today's date in IST as a YYYY-MM-DD string.
 */
export function getTodayIST(): string {
  const now = new Date();
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  return istTime.toISOString().split('T')[0];
}

/**
 * Returns the current IST Date object.
 */
function getNowIST(): Date {
  const now = new Date();
  return new Date(now.getTime() + IST_OFFSET_MS);
}

/**
 * Returns the next 7:00 AM IST as a Date (UTC).
 * If it's currently before 7 AM IST, returns today's 7 AM IST.
 * If it's after 7 AM IST, returns tomorrow's 7 AM IST.
 */
export function getNextScrapeTime(): Date {
  const nowUTC = new Date();
  const istNow = getNowIST();
  const istHour = istNow.getUTCHours();
  const istMinute = istNow.getUTCMinutes();

  // 7:00 AM IST = 1:30 AM UTC
  const targetUTCHour = 1;
  const targetUTCMinute = 30;

  const target = new Date(nowUTC);
  target.setUTCHours(targetUTCHour, targetUTCMinute, 0, 0);

  // If current IST time is past 7:00 AM, schedule for tomorrow
  if (istHour > 7 || (istHour === 7 && istMinute >= 0 && nowUTC > target)) {
    target.setUTCDate(target.getUTCDate() + 1);
  }

  return target;
}

/**
 * Formats a date into a human-readable relative time string.
 *
 * Examples:
 * - "Today at 7:02 AM"
 * - "Yesterday at 3:15 PM"
 * - "May 25, 2025"
 */
export function formatRelativeTime(date: string | Date): string {
  const inputDate = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(inputDate.getTime())) {
    return 'Invalid date';
  }

  // Convert both to IST for comparison
  const inputIST = new Date(inputDate.getTime() + IST_OFFSET_MS);
  const nowIST = getNowIST();

  const inputDateStr = inputIST.toISOString().split('T')[0];
  const todayStr = nowIST.toISOString().split('T')[0];

  const yesterday = new Date(nowIST);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Format time part in IST
  const hours = inputIST.getUTCHours();
  const minutes = inputIST.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  const displayMinute = minutes.toString().padStart(2, '0');
  const timeStr = `${displayHour}:${displayMinute} ${ampm}`;

  if (inputDateStr === todayStr) {
    return `Today at ${timeStr}`;
  }

  if (inputDateStr === yesterdayStr) {
    return `Yesterday at ${timeStr}`;
  }

  // Older dates: "May 25, 2025"
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const month = months[inputIST.getUTCMonth()];
  const day = inputIST.getUTCDate();
  const year = inputIST.getUTCFullYear();

  return `${month} ${day}, ${year}`;
}

/**
 * Checks if a follow-up datetime is overdue (i.e., in the past).
 */
export function isOverdue(datetime: string): boolean {
  const target = new Date(datetime);
  if (isNaN(target.getTime())) {
    return false;
  }
  return target < new Date();
}
