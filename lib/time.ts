const HK_OFFSET_MS = 8 * 60 * 60 * 1000; // Hong Kong is UTC+8 all year.
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when an instant is exactly midnight in Hong Kong. Across the app that
 * is how a date with no known time is stored.
 */
export function isHkMidnight(date: Date): boolean {
  return (date.getTime() + HK_OFFSET_MS) % DAY_MS === 0;
}

/**
 * The last moment a date still counts. A date-only value covers its whole
 * day, so "20 Nov" stays valid until 23:59:59 on the 20th.
 */
export function inclusiveEnd(date: Date): Date {
  return isHkMidnight(date) ? new Date(date.getTime() + DAY_MS - 1000) : date;
}
