import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

// Load the actual backend hook module. It only touches PocketBase globals
// ($app, DateTime, Timezone, Record) inside function bodies, so top-level
// evaluation is safe from a plain Node/Vitest context.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const hooks = require('../../backend/pb_hooks/75hard.shared.js') as {
  normalizeTimezone: (v: unknown) => string;
  normalizeCurrentDay: (v: unknown) => number;
  normalizeCompletedDays: (v: unknown) => number;
  normalizeDayNumber: (v: unknown) => number;
  normalizeRecordDate: (v: unknown) => string;
  offsetISODate: (iso: string, days: number) => string;
  toISODate: (d: Date) => string;
  formatDate: (d: Date) => string;
  isEligibleForCompletion: (record: {
    getBool: (k: string) => boolean;
    getString: (k: string) => string;
  }) => boolean;
};

describe('normalizeTimezone (backend hook)', () => {
  it('defaults blank/nullish input to America/New_York', () => {
    expect(hooks.normalizeTimezone('')).toBe('America/New_York');
    expect(hooks.normalizeTimezone(null)).toBe('America/New_York');
    expect(hooks.normalizeTimezone(undefined)).toBe('America/New_York');
    expect(hooks.normalizeTimezone('   ')).toBe('America/New_York');
  });

  it('preserves whatever non-blank string is provided (validation happens at Timezone construction)', () => {
    expect(hooks.normalizeTimezone('Europe/London')).toBe('Europe/London');
    expect(hooks.normalizeTimezone('UTC')).toBe('UTC');
  });
});

describe('normalizeCurrentDay (backend hook)', () => {
  it('never returns less than 1', () => {
    expect(hooks.normalizeCurrentDay(0)).toBe(1);
    expect(hooks.normalizeCurrentDay(-99)).toBe(1);
    expect(hooks.normalizeCurrentDay(null)).toBe(1);
    expect(hooks.normalizeCurrentDay(undefined)).toBe(1);
    expect(hooks.normalizeCurrentDay(Number.NaN)).toBe(1);
  });

  it('floors fractional values', () => {
    expect(hooks.normalizeCurrentDay(3.9)).toBe(3);
  });

  it('preserves valid positive integers', () => {
    expect(hooks.normalizeCurrentDay(42)).toBe(42);
  });
});

describe('normalizeCompletedDays (backend hook)', () => {
  it('never returns less than 0', () => {
    expect(hooks.normalizeCompletedDays(-5)).toBe(0);
    expect(hooks.normalizeCompletedDays(null)).toBe(0);
    expect(hooks.normalizeCompletedDays(Number.NaN)).toBe(0);
  });

  it('preserves valid non-negative integers', () => {
    expect(hooks.normalizeCompletedDays(41)).toBe(41);
    expect(hooks.normalizeCompletedDays(0)).toBe(0);
  });
});

describe('normalizeDayNumber (backend hook)', () => {
  it('never returns less than 1', () => {
    expect(hooks.normalizeDayNumber(0)).toBe(1);
    expect(hooks.normalizeDayNumber(null)).toBe(1);
    expect(hooks.normalizeDayNumber(Number.NaN)).toBe(1);
  });

  it('preserves valid values', () => {
    expect(hooks.normalizeDayNumber(13)).toBe(13);
  });
});

describe('normalizeRecordDate (backend hook)', () => {
  it('extracts YYYY-MM-DD prefix from PocketBase date/datetime strings', () => {
    expect(hooks.normalizeRecordDate('2026-08-12 00:00:00.000Z')).toBe('2026-08-12');
    expect(hooks.normalizeRecordDate('2026-08-12T04:30:00.000Z')).toBe('2026-08-12');
    expect(hooks.normalizeRecordDate('  2026-08-12  ')).toBe('2026-08-12');
  });

  it('returns short strings as-is when too short to slice cleanly', () => {
    expect(hooks.normalizeRecordDate('foo')).toBe('foo');
    expect(hooks.normalizeRecordDate('')).toBe('');
    expect(hooks.normalizeRecordDate(null)).toBe('');
  });
});

describe('offsetISODate (backend hook)', () => {
  it('shifts a valid ISO date by the given number of days', () => {
    expect(hooks.offsetISODate('2026-08-12', -1)).toBe('2026-08-11');
    expect(hooks.offsetISODate('2026-08-12', 1)).toBe('2026-08-13');
    expect(hooks.offsetISODate('2026-08-12', 0)).toBe('2026-08-12');
  });

  it('handles month and year boundaries', () => {
    expect(hooks.offsetISODate('2026-08-01', -1)).toBe('2026-07-31');
    expect(hooks.offsetISODate('2026-08-31', 1)).toBe('2026-09-01');
    expect(hooks.offsetISODate('2026-01-01', -1)).toBe('2025-12-31');
    expect(hooks.offsetISODate('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('returns the normalized input when it is not parseable', () => {
    expect(hooks.offsetISODate('not-a-date', -1)).toBe('not-a-date');
  });
});

describe('toISODate / formatDate (backend hook)', () => {
  it('formats a Date as YYYY-MM-DD in local time', () => {
    const d = new Date(2026, 7, 3); // Aug 3 2026 local
    expect(hooks.toISODate(d)).toBe('2026-08-03');
    expect(hooks.formatDate(d)).toBe('2026-08-03');
  });
});

describe('isEligibleForCompletion (backend hook)', () => {
  function makeRecord(overrides: Record<string, unknown>) {
    const data: Record<string, unknown> = {
      diet_ok: false,
      workout_1: false,
      workout_2: false,
      water_ok: false,
      reading_ok: false,
      progress_photo: '',
      ...overrides,
    };
    return {
      getBool(key: string): boolean {
        return Boolean(data[key]);
      },
      getString(key: string): string {
        return String(data[key] ?? '');
      },
    };
  }

  it('returns false when any task is incomplete', () => {
    expect(
      hooks.isEligibleForCompletion(
        makeRecord({
          diet_ok: true,
          workout_1: true,
          workout_2: true,
          water_ok: true,
          reading_ok: false,
          progress_photo: 'x.jpg',
        }),
      ),
    ).toBe(false);
  });

  it('returns false when progress_photo is missing', () => {
    expect(
      hooks.isEligibleForCompletion(
        makeRecord({
          diet_ok: true,
          workout_1: true,
          workout_2: true,
          water_ok: true,
          reading_ok: true,
          progress_photo: '',
        }),
      ),
    ).toBe(false);
  });

  it('returns true when all tasks complete and photo present', () => {
    expect(
      hooks.isEligibleForCompletion(
        makeRecord({
          diet_ok: true,
          workout_1: true,
          workout_2: true,
          water_ok: true,
          reading_ok: true,
          progress_photo: 'x.jpg',
        }),
      ),
    ).toBe(true);
  });
});
