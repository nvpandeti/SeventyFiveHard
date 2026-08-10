import { describe, expect, it } from 'vitest';
import {
  getCurrentDayLogDayNumber,
  getCurrentDayLogDayNumberRepair,
  getNextProgressAfterMidnight,
  getProgressSnapshot,
} from './challengeProgress';

describe('getProgressSnapshot', () => {
  it('normalizes empty or invalid user values', () => {
    expect(getProgressSnapshot(null)).toEqual({ currentDay: 1, completedDays: 0 });
    expect(getProgressSnapshot({ current_day: 0, completed_days: -2 })).toEqual({
      currentDay: 1,
      completedDays: 0,
    });
  });
});

describe('getNextProgressAfterMidnight', () => {
  it('increments day and completed count after a successful submission', () => {
    expect(
      getNextProgressAfterMidnight({ current_day: 12, completed_days: 11 }, true),
    ).toEqual({ currentDay: 13, completedDays: 12 });
  });

  it('keeps incrementing beyond day 75 until a missed day', () => {
    expect(
      getNextProgressAfterMidnight({ current_day: 75, completed_days: 74 }, true),
    ).toEqual({ currentDay: 76, completedDays: 75 });
  });

  it('resets progress when yesterday was not submitted', () => {
    expect(
      getNextProgressAfterMidnight({ current_day: 44, completed_days: 43 }, false),
    ).toEqual({ currentDay: 1, completedDays: 0 });
  });
});

describe('getCurrentDayLogDayNumber', () => {
  it('resets current-day log to day 1 when previous day was not completed', () => {
    expect(getCurrentDayLogDayNumber(false, 44)).toBe(1);
  });

  it('increments from previous completed day number', () => {
    expect(getCurrentDayLogDayNumber(true, 12)).toBe(13);
  });

  it('handles missing/invalid previous day number safely', () => {
    expect(getCurrentDayLogDayNumber(true, undefined)).toBe(2);
    expect(getCurrentDayLogDayNumber(true, Number.NaN)).toBe(2);
  });
});

describe('getCurrentDayLogDayNumberRepair', () => {
  it('flags repair when late rollover leaves an outdated current-day log number', () => {
    expect(getCurrentDayLogDayNumberRepair(12, true, 12)).toEqual({
      expectedDayNumber: 13,
      needsRepair: true,
    });
  });

  it('does not flag repair when current-day log already matches expected value', () => {
    expect(getCurrentDayLogDayNumberRepair(13, true, 12)).toEqual({
      expectedDayNumber: 13,
      needsRepair: false,
    });
  });

  it('flags reset to day 1 after a failed previous day', () => {
    expect(getCurrentDayLogDayNumberRepair(18, false, 17)).toEqual({
      expectedDayNumber: 1,
      needsRepair: true,
    });
  });
});
