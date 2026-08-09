import { todayISO } from '../utils/date';

export type FeedStatus = 'complete' | 'failed' | 'in-progress';

/**
 * Derive the display status for a feed log card.
 *
 * - 'complete'    — day was fully submitted
 * - 'failed'      — the day is in the past and was NOT submitted
 * - 'in-progress' — the day is today and is not yet submitted
 *
 * @param logDateISO  YYYY-MM-DD of the log
 * @param completed   whether the log was marked complete
 * @param nowISO      today's date (injectable for testing, defaults to real today)
 */
export function getFeedLogStatus(
  logDateISO: string,
  completed: boolean,
  nowISO: string = todayISO(),
): FeedStatus {
  if (completed) return 'complete';
  const logDay = logDateISO.slice(0, 10);
  if (logDay < nowISO) return 'failed';
  return 'in-progress';
}
