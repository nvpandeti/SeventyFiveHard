import { describe, expect, it } from 'vitest';
import { daysSince, normalizeCurrentDay } from './date';

describe('daysSince', () => {
  it('handles date-only start dates', () => {
    expect(daysSince('2026-08-08', '2026-08-08')).toBe(1);
    expect(daysSince('2026-08-08', '2026-08-10')).toBe(3);
  });

  it('handles datetime start dates (PocketBase style)', () => {
    expect(daysSince('2026-08-08 14:05:00.000Z', '2026-08-08')).toBe(1);
    expect(daysSince('2026-08-07T23:59:59.000Z', '2026-08-08')).toBe(2);
  });

  it('falls back safely on invalid input', () => {
    expect(daysSince('', '2026-08-08')).toBe(1);
    expect(daysSince('not-a-date', '2026-08-08')).toBe(1);
  });
});

describe('normalizeCurrentDay', () => {
  it('normalizes strings and clamps invalid values to day 1', () => {
    expect(normalizeCurrentDay('4')).toBe(4);
    expect(normalizeCurrentDay(0)).toBe(1);
    expect(normalizeCurrentDay(undefined)).toBe(1);
    expect(normalizeCurrentDay('nope')).toBe(1);
  });
});
