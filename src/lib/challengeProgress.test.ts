import { describe, expect, it } from 'vitest';
import { getNextProgressAfterMidnight, getProgressSnapshot } from './challengeProgress';

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
