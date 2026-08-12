import { describe, expect, it } from 'vitest';
import {
  computeScheduledRolloverWindow,
  DEFAULT_TIMEZONE,
  isRolloverDue,
  normalizeTimezone,
} from './rolloverSchedule';

describe('normalizeTimezone', () => {
  it('defaults blank timezone to America/New_York', () => {
    expect(normalizeTimezone('')).toBe(DEFAULT_TIMEZONE);
    expect(normalizeTimezone(undefined)).toBe(DEFAULT_TIMEZONE);
  });

  it('defaults invalid timezone to America/New_York', () => {
    expect(normalizeTimezone('Mars/Olympus')).toBe(DEFAULT_TIMEZONE);
  });

  it('preserves valid timezone', () => {
    expect(normalizeTimezone('Europe/London')).toBe('Europe/London');
  });
});

describe('computeScheduledRolloverWindow', () => {
  it('computes expected rollover window for America/New_York in summer (DST)', () => {
    const now = new Date('2026-08-12T04:30:00.000Z');
    const result = computeScheduledRolloverWindow(now, 'America/New_York');

    expect(result.timezoneName).toBe('America/New_York');
    expect(result.todayISO).toBe('2026-08-12');
    expect(result.rolloverDateISO).toBe('2026-08-11');
    expect(result.nextRolloverAtUTCISO).toBe('2026-08-13T04:00:00.000Z');
  });

  it('computes expected rollover window for America/New_York in winter (standard time)', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    const result = computeScheduledRolloverWindow(now, 'America/New_York');

    expect(result.timezoneName).toBe('America/New_York');
    expect(result.todayISO).toBe('2026-01-15');
    expect(result.rolloverDateISO).toBe('2026-01-14');
    expect(result.nextRolloverAtUTCISO).toBe('2026-01-16T05:00:00.000Z');
  });

  it('uses default timezone when value is invalid', () => {
    const now = new Date('2026-08-12T04:30:00.000Z');
    const result = computeScheduledRolloverWindow(now, 'Invalid/Zone');

    expect(result.timezoneName).toBe(DEFAULT_TIMEZONE);
    expect(result.todayISO).toBe('2026-08-12');
    expect(result.rolloverDateISO).toBe('2026-08-11');
    expect(result.nextRolloverAtUTCISO).toBe('2026-08-13T04:00:00.000Z');
  });
});

describe('isRolloverDue', () => {
  it('treats missing/invalid schedule timestamps as due', () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    expect(isRolloverDue('', now)).toBe(true);
    expect(isRolloverDue('not-a-date', now)).toBe(true);
  });

  it('returns true only when next schedule is <= now', () => {
    const now = new Date('2026-08-12T12:00:00.000Z');
    expect(isRolloverDue('2026-08-12T12:00:00.000Z', now)).toBe(true);
    expect(isRolloverDue('2026-08-12T11:59:59.000Z', now)).toBe(true);
    expect(isRolloverDue('2026-08-12T12:00:01.000Z', now)).toBe(false);
  });
});
